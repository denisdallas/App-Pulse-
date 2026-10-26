import PDFDocument from 'pdfkit';
import { Application, ComplaintTheme, Opportunity, Review } from '../src/types.ts';

export interface ResearchReportInput {
  title: string;
  projectName?: string;
  apps: Application[];
  reviews: Review[];
  themes: ComplaintTheme[];
  opportunities: Opportunity[];
}

export function generateResearchReport(input: ResearchReportInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ margin: 48, size: 'A4', bufferPages: true });
    const chunks: Buffer[] = [];
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);

    const sourceReviews = input.reviews.filter((review) => review.provenance === 'live_marketplace' || review.provenance === 'imported');
    const liveReviews = sourceReviews.filter((review) => review.provenance === 'live_marketplace');
    const importedReviews = sourceReviews.filter((review) => review.provenance === 'imported');
    const negativeReviews = sourceReviews.filter((review) => review.starRating <= 2);
    const counts = new Map<string, number>();
    for (const review of negativeReviews) {
      const category = review.classification?.category || 'Unclassified';
      counts.set(category, (counts.get(category) || 0) + 1);
    }

    document.fontSize(22).fillColor('#172554').text(input.title, { align: 'left' });
    document.moveDown(0.4).fontSize(10).fillColor('#475569')
      .text(`Generated ${new Date().toISOString()}${input.projectName ? ` | Project: ${input.projectName}` : ''}`);
    document.moveDown().fontSize(12).fillColor('#0f172a').text('Research scope', { underline: true });
    document.fontSize(10).text(`Applications analyzed: ${input.apps.length}`)
      .text(`Reviews analyzed: ${sourceReviews.length} (${liveReviews.length} live marketplace, ${importedReviews.length} user-imported)`)
      .text(`Negative reviews: ${negativeReviews.length} of ${sourceReviews.length || 0}`)
      .text(`Marketplaces: ${Array.from(new Set(input.apps.map((app) => app.marketplace))).join(', ') || 'None'}`);

    document.moveDown().fontSize(12).text('Complaint themes', { underline: true });
    if (counts.size === 0) document.fontSize(10).text('No classified negative-review themes are available for this scope.');
    for (const [category, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      const denominator = negativeReviews.length || 1;
      document.fontSize(10).text(`${category}: ${count} reviews (${((count / denominator) * 100).toFixed(1)}% of negative sample)`);
    }

    document.moveDown().fontSize(12).text('Evidence-backed findings', { underline: true });
    const themes = input.themes.slice(0, 12);
    if (themes.length === 0) document.fontSize(10).text('No saved themes are available.');
    for (const theme of themes) {
      document.fontSize(10).fillColor('#0f172a').text(`${theme.title} — ${theme.reviewCount} supporting reviews; confidence ${(theme.confidenceScore * 100).toFixed(0)}%`);
      document.fillColor('#475569').text(theme.summary);
      if (theme.representativeQuotes[0]) document.text(`Evidence: “${theme.representativeQuotes[0]}”`);
      document.moveDown(0.25);
    }

    document.moveDown().fontSize(12).fillColor('#0f172a').text('Prioritized opportunities', { underline: true });
    if (input.opportunities.length === 0) document.fontSize(10).text('No opportunities are available for this scope.');
    for (const opportunity of input.opportunities.slice(0, 12)) {
      document.fontSize(10).text(`${opportunity.title} — priority ${opportunity.priorityScore}/100`);
      document.fillColor('#475569').text(opportunity.problemStatement);
      document.moveDown(0.25);
    }

    document.addPage();
    document.fontSize(12).fillColor('#0f172a').text('Data limitations', { underline: true });
    document.fontSize(10).text('This report summarizes live marketplace records and user-imported records that have stored source provenance. Imported records are not independently verified by AppPulse. Metrics describe only the included sample. AI-generated themes and opportunity narratives are hypotheses linked to review evidence, not proof of market demand.');
    document.moveDown().text('Source links');
    for (const app of input.apps.slice(0, 20)) document.fillColor('#2563eb').text(`${app.name}: ${app.storeUrl}`);

    const pages = document.bufferedPageRange();
    for (let page = 0; page < pages.count; page++) {
      document.switchToPage(page);
      document.fontSize(8).fillColor('#64748b').text(`AppPulse Intelligence | Page ${page + 1} of ${pages.count}`, 48, 780, { align: 'center', width: 500 });
    }
    document.end();
  });
}
