import fs from 'fs';
import path from 'path';
import { generateAuditPdf } from './generateAuditPdf.ts';

const rootDir = process.cwd();
const publicDir = path.join(rootDir, 'public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const targetPdfPath = path.join(rootDir, 'AppPulse_Implementation_Audit_Report.pdf');
const publicPdfPath = path.join(publicDir, 'AppPulse_Implementation_Audit_Report.pdf');

console.log('Generating audit report PDF...');
generateAuditPdf(targetPdfPath);
generateAuditPdf(publicPdfPath);
console.log('PDF generated successfully at:');
console.log(' - ' + targetPdfPath);
console.log(' - ' + publicPdfPath);
