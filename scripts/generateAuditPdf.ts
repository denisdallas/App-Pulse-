import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';

export function generateAuditPdf(outputPath: string) {
  const doc = new PDFDocument({
    margin: 40,
    size: 'A4',
    info: {
      Title: 'AppPulse Intelligence — Implementation Verification & Reality Audit',
      Author: 'AppPulse Engineering Team',
      Subject: 'Technical Reality Audit and Production Gap Analysis',
      Keywords: 'AppPulse, Audit, Market Intelligence, Google Play, Steam, Microsoft Store',
    },
  });

  const writeStream = fs.createWriteStream(outputPath);
  doc.pipe(writeStream);

  // Styling helpers
  const primaryColor = '#0f172a'; // slate-900
  const accentColor = '#4f46e5';  // indigo-600
  const emeraldColor = '#059669'; // emerald-600
  const amberColor = '#d97706';   // amber-600
  const roseColor = '#dc2626';    // rose-600
  const textDark = '#1e293b';     // slate-800
  const textMuted = '#64748b';    // slate-500
  const bgLight = '#f8fafc';      // slate-50

  // Header Banner
  doc.rect(0, 0, doc.page.width, 90).fill(primaryColor);
  
  doc.fontSize(22).font('Helvetica-Bold').fillColor('#ffffff').text('AppPulse Intelligence', 40, 25);
  doc.fontSize(11).font('Helvetica').fillColor('#94a3b8').text('Technical Implementation Verification & Production Reality Audit', 40, 52);
  doc.fontSize(9).font('Helvetica').fillColor('#cbd5e1').text(`Audit Date: October 2026 | Environment: Linux/Node.js | Status: Comprehensive`, 40, 68);

  doc.y = 110;

  // SECTION 1: EXECUTIVE SUMMARY
  doc.fontSize(14).font('Helvetica-Bold').fillColor(primaryColor).text('1. Executive Summary', 40, doc.y);
  doc.rect(40, doc.y + 4, 515, 1).fill('#cbd5e1');
  doc.y += 12;

  doc.fontSize(9.5).font('Helvetica').fillColor(textDark).text(
    'This audit evaluates the codebase of AppPulse Intelligence against its Product Requirements Document (PRD). ' +
    'The application features a polished, responsive React 19 / Tailwind CSS frontend, an Express 4 backend server, ' +
    'algorithmic scoring modules with 100% test pass rates, and server-side Gemini 3.8 Flash SDK integration. ' +
    'However, critical production gaps exist between the UI presentation and live backend services:\n\n' +
    '• Database Persistence: There is NO relational database. State is serialized to a flat JSON file (store.json), lacking ACID transactions and crash-resilience.\n' +
    '• Marketplace Connectors: Steam is VERIFIED live against public APIs. In contrast, Google Play and Microsoft Store are non-functional stubs that fall back to synthetic mock reviews.\n' +
    '• Authentication: NOT IMPLEMENTED. All API endpoints and workspace data are globally accessible.\n' +
    '• Outreach Delivery: Email and WhatsApp dispatch are simulated via in-memory counters and audit logs with no active SMTP or Twilio transports.'
  );

  doc.y += 16;

  // SECTION 2: VERIFIED COMMAND & BUILD RESULTS
  doc.fontSize(14).font('Helvetica-Bold').fillColor(primaryColor).text('2. Verified Test, Lint & Build Results', 40, doc.y);
  doc.rect(40, doc.y + 4, 515, 1).fill('#cbd5e1');
  doc.y += 12;

  const results = [
    { cmd: 'npm test (Node test runner)', status: 'PASSED (Exit code 0)', detail: '6/6 tests passing (234ms). Scoring, dedup, suppression, CSV, versions, and forecast calculations verified.' },
    { cmd: 'npm run lint (TypeScript tsc --noEmit)', status: 'PASSED (Exit code 0)', detail: 'Zero compiler type errors across all frontend and backend source files.' },
    { cmd: 'npm run build (Vite 8.3 production build)', status: 'PASSED (Exit code 0)', detail: 'Production client assets bundled in 460ms (HTML 1.31kB, CSS 49.4kB, JS 628.7kB).' },
    { cmd: 'Steam Search Live Endpoint Test', status: 'VERIFIED (HTTP 200)', detail: 'Direct node fetch to store.steampowered.com/api/storesearch returned 6 real items for "accounting".' },
    { cmd: 'Steam Community Reviews Live Test', status: 'VERIFIED (HTTP 200)', detail: 'Direct node fetch to store.steampowered.com/appreviews/730 returned real public user reviews.' },
  ];

  for (const r of results) {
    doc.fontSize(9).font('Helvetica-Bold').fillColor(primaryColor).text(`• ${r.cmd}: `, 45, doc.y, { continued: true });
    doc.fillColor(emeraldColor).text(r.status);
    doc.fontSize(8.5).font('Helvetica').fillColor(textMuted).text(`   ${r.detail}`, 55, doc.y);
    doc.y += 4;
  }

  doc.y += 14;

  // SECTION 3: FEATURE-BY-FEATURE VERIFICATION TABLE
  doc.fontSize(14).font('Helvetica-Bold').fillColor(primaryColor).text('3. Feature-by-Feature Reality Audit Matrix', 40, doc.y);
  doc.rect(40, doc.y + 4, 515, 1).fill('#cbd5e1');
  doc.y += 10;

  const features = [
    { name: '1. App Discovery & Filtering', status: 'PARTIALLY WORKING', notes: 'Local multi-filter works; Steam live search works; GP/MS online searches return empty.' },
    { name: '2. Google Play Review Retrieval', status: 'MOCK ONLY', notes: 'Connector is a stub returning []. Ingestion inserts 2 hardcoded synthetic mock reviews.' },
    { name: '3. Microsoft Store Review Retrieval', status: 'MOCK ONLY', notes: 'Connector is a stub returning []. Ingestion inserts 2 hardcoded synthetic mock reviews.' },
    { name: '4. Steam Store & Review Retrieval', status: 'VERIFIED', notes: 'Live public API verified. Ingests genuine Steam search and community review feeds.' },
    { name: '5. Dedup & Normalization', status: 'PARTIALLY WORKING', notes: 'SHA-256 fingerprinting unit-tested. Missing pagination cursors and 429 backoff retries.' },
    { name: '6. Background Job Engine', status: 'MOCK ONLY', notes: 'Jobs run in-memory via setTimeout(800). No persistent job queue; lost on server restart.' },
    { name: '7. Data Persistence & Recovery', status: 'PARTIALLY WORKING', notes: 'Survives restart via store.json, but has no ACID safety, indexing, or migration system.' },
    { name: '8. Auth & Workspace Isolation', status: 'NOT IMPLEMENTED', notes: 'Zero auth routes. Workspaces are purely cosmetic client-side dropdown options.' },
    { name: '9. AI Complaint Classification', status: 'VERIFIED (Conditional)', notes: 'Full Gemini 3.8 Flash integration with structured JSON. Fallback rules if key is missing.' },
    { name: '10. Evidence Linking to Reviews', status: 'PARTIALLY WORKING', notes: 'Stores quotes and app names, but lacks relational foreign keys linking themes to Review IDs.' },
    { name: '11. Competitor Comparison', status: 'VERIFIED', notes: 'Dynamic negative sentiment rate, complaint breakdown, and feature request calculation.' },
    { name: '12. Opportunity Scoring Logic', status: 'VERIFIED', notes: 'Scoring algorithm (severity, frequency, recency, breadth) passing all unit tests.' },
    { name: '13. CSV Import & Export', status: 'VERIFIED', notes: 'RFC-4180 CSV serializer/parser verified with commas, quotes, and newlines in tests.' },
    { name: '14. Contact & Draft Management', status: 'VERIFIED', notes: 'Full CRUD on contacts; AI-driven contextual email copy generation using Gemini SDK.' },
    { name: '15. Email & WhatsApp Delivery', status: 'PARTIALLY WORKING', notes: 'Suppression/opt-out check VERIFIED. Actual email/WhatsApp delivery is MOCK ONLY.' },
    { name: '16. Integration Health & Settings', status: 'MOCK ONLY', notes: 'Settings view displays hardcoded static latencies (42ms/84ms/110ms) and fake status.' },
  ];

  // Table header
  doc.rect(40, doc.y, 515, 16).fill('#e2e8f0');
  doc.fontSize(8.5).font('Helvetica-Bold').fillColor(primaryColor);
  doc.text('Feature Module', 45, doc.y + 4);
  doc.text('Status', 210, doc.y + 4);
  doc.text('Reality Verification & Findings', 315, doc.y + 4);
  doc.y += 18;

  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    const isEven = i % 2 === 0;
    if (isEven) {
      doc.rect(40, doc.y, 515, 14).fill(bgLight);
    }
    
    // Status color
    let sColor = emeraldColor;
    if (f.status.includes('MOCK')) sColor = amberColor;
    else if (f.status.includes('PARTIAL')) sColor = '#0284c7';
    else if (f.status.includes('NOT')) sColor = roseColor;

    doc.fontSize(7.5).font('Helvetica-Bold').fillColor(textDark).text(f.name, 45, doc.y + 3);
    doc.fillColor(sColor).text(f.status, 210, doc.y + 3);
    doc.font('Helvetica').fillColor(textMuted).text(f.notes, 315, doc.y + 3, { width: 235 });
    doc.y += 15;

    // Check for page overflow
    if (doc.y > 720) {
      doc.addPage();
      doc.y = 40;
    }
  }

  // Next Page: Deep Dive Findings & Top 5 Issues
  if (doc.y > 550) {
    doc.addPage();
    doc.y = 40;
  } else {
    doc.y += 15;
  }

  // SECTION 4: DATA ARCHITECTURE & SECURITY RISKS
  doc.fontSize(14).font('Helvetica-Bold').fillColor(primaryColor).text('4. Data Architecture, Security & Persistence Risks', 40, doc.y);
  doc.rect(40, doc.y + 4, 515, 1).fill('#cbd5e1');
  doc.y += 12;

  doc.fontSize(9).font('Helvetica').fillColor(textDark).text(
    '1. Crash & Corruption Vulnerability: server/store.ts saves data via synchronous fs.writeFileSync to a single JSON file. If the process is halted mid-write, the database will be corrupted and reset on next boot.\n' +
    '2. Concurrency Race Conditions: Express handles concurrent requests asynchronously, but all store mutations write to a shared in-memory object and flush the entire database to disk without file locking.\n' +
    '3. Mixed Seed & Live Data: Seed data (SEED_APPS, getSeedReviews) is merged directly into the live collections without provenance separation (is_seed flag).\n' +
    '4. Secret Hygiene: Credentials (GEMINI_API_KEY) are kept strictly server-side in process.env and not exposed to Vite client bundles, complying with security standards.'
  );

  doc.y += 16;

  // SECTION 5: TOP 5 PRIORITIZED REMEDIATION STEPS
  doc.fontSize(14).font('Helvetica-Bold').fillColor(primaryColor).text('5. Top 5 Prioritized Issues to Resolve', 40, doc.y);
  doc.rect(40, doc.y + 4, 515, 1).fill('#cbd5e1');
  doc.y += 12;

  const topIssues = [
    {
      title: 'Priority 1: Eliminate Synthetic Review Fallbacks in Store Collection',
      desc: 'In server/store.ts (lines 388–436), failed connector calls automatically inject fabricated negative reviews. This directly violates PRD Rule 2E ("The application must never invent collection results or reviews"). Failed jobs must record a real error state.',
    },
    {
      title: 'Priority 2: Transition from store.json to a Real Relational Database',
      desc: 'Deploy SQLite or PostgreSQL to provide genuine ACID transactions, relational foreign key constraints between complaint themes and reviews, index-backed pagination, and durable persistence.',
    },
    {
      title: 'Priority 3: Complete the Google Play & Microsoft Connectors',
      desc: 'Integrate real public listing and review retrieval for Google Play (via public store RSS or scraper) and Microsoft Store (via Store Display Catalog API) so non-Steam platforms are not stubs.',
    },
    {
      title: 'Priority 4: Implement Durable Background Task Processing',
      desc: 'Replace in-memory setTimeout(800) with a durable job runner so that review collection jobs survive server reboots and report live progress percentages accurately.',
    },
    {
      title: 'Priority 5: Connect Real Outbound Email Transport (SMTP / Resend)',
      desc: 'Wire a real mail transport for the Outreach Studio so approved campaigns actually dispatch emails and record verifiable delivery receipt events.',
    },
  ];

  for (const issue of topIssues) {
    doc.fontSize(9.5).font('Helvetica-Bold').fillColor(accentColor).text(issue.title, 45, doc.y);
    doc.y += 3;
    doc.fontSize(8.5).font('Helvetica').fillColor(textDark).text(issue.desc, 55, doc.y, { width: 495 });
    doc.y += 10;
  }

  doc.y += 12;

  // Recommended Next Step Box
  doc.rect(40, doc.y, 515, 60).fill('#e0e7ff');
  doc.rect(40, doc.y, 515, 60).stroke('#6366f1');
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#312e81').text('RECOMMENDED SMALLEST SAFE IMPLEMENTATION STEP (MVP)', 50, doc.y + 8);
  doc.fontSize(8.5).font('Helvetica').fillColor('#1e1b4b').text(
    'Remove the synthetic review injection fallback from server/store.ts so that collection only ingests verified data; ' +
    'harden the verified Steam connector with live pagination and error reporting; and connect live latency pings in SettingsView. ' +
    'This guarantees 100% data provenance compliance before provisioning relational databases.',
    50, doc.y + 24, { width: 495 }
  );

  // Footer on all pages
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).font('Helvetica').fillColor('#94a3b8').text(
      `AppPulse Intelligence Reality Audit — Page ${i + 1} of ${range.count} — Confidential & Proprietary`,
      40,
      doc.page.height - 30,
      { align: 'center', width: doc.page.width - 80 }
    );
  }

  doc.end();
}
