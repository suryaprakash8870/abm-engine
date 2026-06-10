import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express';
import type { CrmProvider } from '@abm/shared';
import { CrmAdapterFactory } from '../crm-adapter/crm-adapter.factory';
import { IcpAnalyzerService, DerivedRule } from './icp-analyzer.service';
import { memoryStorage } from 'multer';

const CSV_UPLOAD_OPTIONS = {
  storage: memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req: unknown, file: Express.Multer.File, cb: (err: Error | null, ok: boolean) => void) => {
    if (!file.originalname.match(/\.(csv|txt)$/i)) {
      return cb(new BadRequestException('Only CSV files are accepted'), false);
    }
    cb(null, true);
  },
};

@Controller('icp')
export class IcpAnalyzerController {
  constructor(
    private readonly analyzer: IcpAnalyzerService,
    private readonly crm: CrmAdapterFactory,
  ) {}

  /**
   * Playbook Step 1 — win/loss analysis straight from live CRM deals.
   * No CSV export needed: pulls closed-won/lost deals + their companies,
   * surfaces ACV, sales cycle, win rate, and the same derived rubric rules
   * as the CSV path.
   * GET /api/icp/analyze-from-crm?provider=hubspot
   */
  @Get('analyze-from-crm')
  async analyzeFromCrm(@Query('provider') providerParam?: CrmProvider) {
    const provider = providerParam ?? 'hubspot';
    const adapter = this.crm.forProvider(provider);

    // Pull all deals (capped) and the companies behind them.
    const deals: Awaited<ReturnType<typeof adapter.getDeals>>['deals'] = [];
    let cursor: string | undefined;
    do {
      const page = await adapter.getDeals({ cursor, limit: 100 });
      deals.push(...page.deals);
      cursor = page.nextCursor;
    } while (cursor && deals.length < 2000);

    const accountsByExternalId = new Map<
      string,
      { industry?: string | null; employees?: string | number | null; country?: string | null }
    >();
    cursor = undefined;
    let fetched = 0;
    do {
      const page = await adapter.getAccounts({ cursor, limit: 100 });
      for (const a of page.accounts) {
        const p = (a.properties ?? {}) as Record<string, unknown>;
        accountsByExternalId.set(a.externalId, {
          industry: p.industry as string | null,
          employees: p.numberofemployees as string | number | null,
          country: p.country as string | null,
        });
      }
      fetched += page.accounts.length;
      cursor = page.nextCursor;
    } while (cursor && fetched < 5000);

    return this.analyzer.analyzeDeals(deals, accountsByExternalId);
  }

  /**
   * Step 1 — upload won-accounts CSV, get back patterns + derived rubric.
   * POST /api/icp/analyze-won
   * Body: multipart/form-data, field name: "file"
   */
  @Post('analyze-won')
  @UseInterceptors(FileInterceptor('file', CSV_UPLOAD_OPTIONS))
  analyzeWon(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    try {
      return this.analyzer.analyzeWonData(file.buffer);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  /**
   * Step 2 — score a prospects CSV against previously derived rules.
   * POST /api/icp/score-prospects
   * Body: multipart/form-data, fields: "file" (CSV) + "rules" (JSON string)
   */
  @Post('score-prospects')
  @UseInterceptors(FileInterceptor('file', CSV_UPLOAD_OPTIONS))
  scoreProspects(
    @UploadedFile() file: Express.Multer.File,
    @Body('rules') rulesJson: string,
  ) {
    if (!file) throw new BadRequestException('No prospects file uploaded');
    if (!rulesJson) throw new BadRequestException('rules JSON required in body');

    let rules: DerivedRule[];
    try {
      rules = JSON.parse(rulesJson) as DerivedRule[];
    } catch {
      throw new BadRequestException('rules must be valid JSON');
    }

    try {
      return { prospects: this.analyzer.scoreProspects(file.buffer, rules) };
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  /**
   * One-shot: upload both CSVs together and get analysis + scored prospects.
   * POST /api/icp/analyze-and-score
   * Body: multipart/form-data, fields: "won" + "prospects"
   */
  @Post('analyze-and-score')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'won', maxCount: 1 }, { name: 'prospects', maxCount: 1 }],
      { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } },
    ),
  )
  analyzeAndScore(
    @UploadedFiles()
    files: { won?: Express.Multer.File[]; prospects?: Express.Multer.File[] },
  ) {
    const wonFile = files?.won?.[0];
    const prospectFile = files?.prospects?.[0];
    if (!wonFile) throw new BadRequestException('won file required');
    if (!prospectFile) throw new BadRequestException('prospects file required');

    const analysis = this.analyzer.analyzeWonData(wonFile.buffer);
    const scored = this.analyzer.scoreProspects(prospectFile.buffer, analysis.derivedRules);

    return { analysis, prospects: scored };
  }
}
