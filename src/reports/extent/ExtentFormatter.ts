import { Formatter, IFormatterOptions } from '@cucumber/cucumber';
import { generateExtentReport } from './generateExtentReport';

export default class ExtentFormatter extends Formatter {
  static readonly documentation = 'Writes an Extent-style HTML activity report under reports/extent';

  constructor(options: IFormatterOptions) {
    super(options);
    options.eventBroadcaster.on('envelope', (envelope: { testRunFinished?: unknown }) => {
      if (!envelope.testRunFinished) return;
      try {
        const file = generateExtentReport();
        this.log(`Extent activity report: ${file}\n`);
      } catch (error) {
        this.log(`Extent report generation failed: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    });
  }
}
