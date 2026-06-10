import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express';
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
  constructor(private readonly analyzer: IcpAnalyzerService) {}

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
