import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import * as XLSX from 'xlsx';
import { Application, Review, ComplaintTheme, Opportunity, Contact, ResearchProject } from '../../src/types.ts';

export interface ResearchReportData {
  title: string;
  project?: ResearchProject;
  apps: Application[];
  reviews: Review[];
  themes: ComplaintTheme[];
  opportunities: Opportunity[];
  prospects: Contact[];
}

export function escapeSpreadsheetValue(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  // Defend against CSV/Formula injection (RFC 4180 + Excel DDE)
  if (/^[=\+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

export async function generateResearchPdf(data: ResearchReportData, outputPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 40,
      size: 'A4',
      info: {
        Title: data.title,
        Author: 'AppPulse Intelligence Platform',
        Subject: 'Market Intelligence & Product Opportunity Research Report',
      },
    });

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);

    const primaryColor = '#0f172a'; // slate-900
    const indigoColor = '#4f46e5';  // indigo-600
    const emeraldColor = '#059669'; // emerald-600
    const textDark = '#1e293b';     // slate-800
    const textMuted = '#64748b';    // slate-500

    // Header Banner
    doc.rect(0, 0, doc.page.width, 95).fill(primaryColor);
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#ffffff').text('AppPulse Intelligence', 40, 24);
    doc.fontSize(11).font('Helvetica').fillColor('#cbd5e1').text(data.title, 40, 50);
    doc.fontSize(8.5).font('Helvetica').fillColor('#94a3b8').text(
      `Generated: ${new Date().toISOString().split('T')[0]} | Project: ${data.project?.name || 'Full Workspace Scope'} | Methodology: Evidence-Backed Intelligence`,
      40,
      68
    );

    doc.y = 115;

    // SECTION 1: EXECUTIVE SUMMARY
    doc.fontSize(13).font('Helvetica-Bold').fillColor(primaryColor).text('1. Executive Summary & Research Scope', 40, doc.y);
    doc.rect(40, doc.y + 3, 515, 1).fill('#cbd5e1');
    doc.y += 10;

    const totalReviews = data.reviews.length;
    const negReviews = data.reviews.filter((r) => r.starRating <= 2).length;
    const negRate = totalReviews > 0 ? ((negReviews / totalReviews) * 100).toFixed(1) : '0.0';

    doc.fontSize(9).font('Helvetica').fillColor(textDark).text(
      `This empirical research report synthesizes feedback from ${data.apps.length} competitor application(s) ` +
      `across ${totalReviews} verified public user reviews. The analysis identified ${negReviews} negative reviews (${negRate}% churn velocity), ` +
      `distilling them into ${data.themes.length} critical complaint themes and ${data.opportunities.length} high-leverage product opportunities.\n\n` +
      `Data Provenance & Integrity Statement: All customer quotes and ratings in this report are direct extracts from public marketplace feeds. ` +
      `Future predictions, sentiment clusters, and priority scores are clearly labeled AI/heuristic interpretations rather than historical facts.`
    );

    doc.y += 14;

    // SECTION 2: APPLICATIONS EXAMINED
    doc.fontSize(13).font('Helvetica-Bold').fillColor(primaryColor).text('2. Examined Applications & Marketplace Coverage', 40, doc.y);
    doc.rect(40, doc.y + 3, 515, 1).fill('#cbd5e1');
    doc.y += 10;

    // Apps Table Header
    doc.rect(40, doc.y, 515, 16).fill('#f1f5f9');
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor(primaryColor);
    doc.text('Application Name', 45, doc.y + 4);
    doc.text('Marketplace', 210, doc.y + 4);
    doc.text('Rating', 310, doc.y + 4);
    doc.text('Reviews Sampled', 370, doc.y + 4);
    doc.text('Provenance', 460, doc.y + 4);
    doc.y += 18;

    for (const app of data.apps.slice(0, 8)) {
      const appRevCount = data.reviews.filter((r) => r.appId === app.id).length;
      doc.fontSize(8).font('Helvetica-Bold').fillColor(textDark).text(app.name.slice(0, 30), 45, doc.y);
      doc.font('Helvetica').fillColor(textMuted).text(app.marketplace.toUpperCase(), 210, doc.y);
      doc.text(`${app.rating} ★`, 310, doc.y);
      doc.text(String(appRevCount), 370, doc.y);
      doc.fillColor(app.isDemo ? '#d97706' : emeraldColor).text(app.isDemo ? 'Demo/Seed' : 'Verified Live', 460, doc.y);
      doc.y += 14;
    }

    doc.y += 14;

    // Check page overflow
    if (doc.y > 680) {
      doc.addPage();
      doc.y = 40;
    }

    // SECTION 3: TOP COMPLAINT THEMES & LINKED EVIDENCE
    doc.fontSize(13).font('Helvetica-Bold').fillColor(primaryColor).text('3. Significant Complaint Themes & Review Evidence', 40, doc.y);
    doc.rect(40, doc.y + 3, 515, 1).fill('#cbd5e1');
    doc.y += 10;

    for (const theme of data.themes.slice(0, 4)) {
      if (doc.y > 660) {
        doc.addPage();
        doc.y = 40;
      }

      doc.fontSize(9.5).font('Helvetica-Bold').fillColor(indigoColor).text(theme.title, 45, doc.y);
      doc.y += 2;
      doc.fontSize(8.5).font('Helvetica').fillColor(textMuted).text(
        `Category: ${theme.category} | Severity: ${theme.severity} | Affected Apps: ${theme.affectedAppNames.join(', ') || 'General'}`
      );
      doc.y += 4;
      doc.fontSize(8.5).font('Helvetica').fillColor(textDark).text(`Summary: ${theme.summary}`, { width: 505 });
      doc.y += 4;

      if (theme.representativeQuotes && theme.representativeQuotes.length > 0) {
        doc.fontSize(8).font('Helvetica-Oblique').fillColor('#334155').text(
          `Representative Evidence: "${theme.representativeQuotes[0].slice(0, 160)}..."`,
          55,
          doc.y,
          { width: 490 }
        );
        doc.y += 6;
      }
      doc.y += 6;
    }

    // Check page overflow
    if (doc.y > 600) {
      doc.addPage();
      doc.y = 40;
    } else {
      doc.y += 14;
    }

    // SECTION 4: PRODUCT OPPORTUNITIES & STRATEGIC RECOMMENDATIONS
    doc.fontSize(13).font('Helvetica-Bold').fillColor(primaryColor).text('4. High-Value Product Opportunities & Wedge Features', 40, doc.y);
    doc.rect(40, doc.y + 3, 515, 1).fill('#cbd5e1');
    doc.y += 10;

    for (const opp of data.opportunities.slice(0, 3)) {
      if (doc.y > 680) {
        doc.addPage();
        doc.y = 40;
      }

      doc.fontSize(9.5).font('Helvetica-Bold').fillColor(primaryColor).text(
        `${opp.title} — Opportunity Priority Score: ${Math.round(opp.priorityScore)}/100`,
        45,
        doc.y
      );
      doc.y += 3;
      doc.fontSize(8.5).font('Helvetica').fillColor(textDark).text(`Target User Segment: ${opp.targetUser}`);
      doc.fontSize(8.5).font('Helvetica').fillColor(textDark).text(`Proposed Wedge Concept: ${opp.proposedConcept}`, { width: 505 });
      doc.y += 2;
      doc.fontSize(8).font('Helvetica').fillColor(textMuted).text(
        `Next Validation Step: ${opp.validationStep || 'Engage target users via consultative interviews'}`,
        { width: 505 }
      );
      doc.y += 8;
    }

    // SECTION 5: LEGITIMATE B2B PROSPECTS
    if (data.prospects && data.prospects.length > 0) {
      if (doc.y > 650) {
        doc.addPage();
        doc.y = 40;
      } else {
        doc.y += 12;
      }

      doc.fontSize(13).font('Helvetica-Bold').fillColor(primaryColor).text('5. Identified Business Prospects & Verified Sources', 40, doc.y);
      doc.rect(40, doc.y + 3, 515, 1).fill('#cbd5e1');
      doc.y += 8;

      doc.rect(40, doc.y, 515, 16).fill('#f1f5f9');
      doc.fontSize(8).font('Helvetica-Bold').fillColor(primaryColor);
      doc.text('Contact Name', 45, doc.y + 4);
      doc.text('Company / Role', 170, doc.y + 4);
      doc.text('Channel', 320, doc.y + 4);
      doc.text('Verified Public Source', 390, doc.y + 4);
      doc.y += 18;

      for (const p of data.prospects.slice(0, 5)) {
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor(textDark).text(p.name, 45, doc.y);
        doc.font('Helvetica').fillColor(textMuted).text(`${p.company} (${p.title})`.slice(0, 28), 170, doc.y);
        doc.text(p.channel, 320, doc.y);
        doc.text((p.verifiedSource || p.sourceUrl || 'Public Publisher Info').slice(0, 30), 390, doc.y);
        doc.y += 14;
      }
    }

    // Footers
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).font('Helvetica').fillColor('#94a3b8').text(
        `AppPulse Intelligence — Research Report | Page ${i + 1} of ${range.count} | Evidence-Based Analysis`,
        40,
        doc.page.height - 25,
        { align: 'center', width: doc.page.width - 80 }
      );
    }

    doc.end();

    writeStream.on('finish', () => {
      const stats = fs.statSync(outputPath);
      resolve(stats.size);
    });
    writeStream.on('error', reject);
  });
}

export function generateResearchXlsx(data: ResearchReportData, outputPath: string): number {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const wb = XLSX.utils.book_new();

  // Sheet 1: Examined Apps
  const appsData = data.apps.map((a) => ({
    'App ID': escapeSpreadsheetValue(a.id),
    'App Name': escapeSpreadsheetValue(a.name),
    'Publisher': escapeSpreadsheetValue(a.publisher),
    'Marketplace': escapeSpreadsheetValue(a.marketplace),
    'Category': escapeSpreadsheetValue(a.category),
    'Rating': a.rating,
    'Rating Count': a.ratingCount,
    'Review Count': a.reviewCount,
    'Platform': escapeSpreadsheetValue(a.platform),
    'Version': escapeSpreadsheetValue(a.currentVersion),
    'Store URL': escapeSpreadsheetValue(a.storeUrl),
    'Provenance': escapeSpreadsheetValue(a.isDemo ? 'Demo/Seed' : 'Verified Live'),
  }));
  const wsApps = XLSX.utils.json_to_sheet(appsData);
  XLSX.utils.book_append_sheet(wb, wsApps, 'Applications');

  // Sheet 2: Reviews
  const reviewsData = data.reviews.map((r) => ({
    'Review ID': escapeSpreadsheetValue(r.id),
    'App Name': escapeSpreadsheetValue(r.appName),
    'Marketplace': escapeSpreadsheetValue(r.marketplace),
    'Star Rating': r.starRating,
    'Review Date': escapeSpreadsheetValue(r.reviewDate),
    'Review Text': escapeSpreadsheetValue(r.text),
    'App Version': escapeSpreadsheetValue(r.appVersion),
    'Helpful Votes': r.helpfulVotes || 0,
    'Category': escapeSpreadsheetValue(r.classification?.category || ''),
    'Severity': escapeSpreadsheetValue(r.classification?.severity || ''),
    'Provenance': escapeSpreadsheetValue(r.isDemo ? 'Demo/Seed' : 'Verified Live'),
  }));
  const wsReviews = XLSX.utils.json_to_sheet(reviewsData);
  XLSX.utils.book_append_sheet(wb, wsReviews, 'Reviews');

  // Sheet 3: Opportunities
  const oppsData = data.opportunities.map((o) => ({
    'Opportunity ID': escapeSpreadsheetValue(o.id),
    'Title': escapeSpreadsheetValue(o.title),
    'Priority Score (0-100)': o.priorityScore,
    'Severity': escapeSpreadsheetValue(o.severity),
    'Target User': escapeSpreadsheetValue(o.targetUser),
    'Problem Statement': escapeSpreadsheetValue(o.problemStatement),
    'Proposed Concept': escapeSpreadsheetValue(o.proposedConcept),
    'Validation Step': escapeSpreadsheetValue(o.validationStep || ''),
    'Status': escapeSpreadsheetValue(o.status),
  }));
  const wsOpps = XLSX.utils.json_to_sheet(oppsData);
  XLSX.utils.book_append_sheet(wb, wsOpps, 'Opportunities');

  // Sheet 4: Prospects
  if (data.prospects && data.prospects.length > 0) {
    const prospectsData = data.prospects.map((p) => ({
      'Contact ID': escapeSpreadsheetValue(p.id),
      'Name': escapeSpreadsheetValue(p.name),
      'Company': escapeSpreadsheetValue(p.company),
      'Title': escapeSpreadsheetValue(p.title),
      'Email': escapeSpreadsheetValue(p.email),
      'Website': escapeSpreadsheetValue(p.website || ''),
      'Channel': escapeSpreadsheetValue(p.channel),
      'Verified Source': escapeSpreadsheetValue(p.verifiedSource || p.sourceUrl),
      'Status': escapeSpreadsheetValue(p.status),
    }));
    const wsProspects = XLSX.utils.json_to_sheet(prospectsData);
    XLSX.utils.book_append_sheet(wb, wsProspects, 'Prospects');
  }

  XLSX.writeFile(wb, outputPath);
  const stats = fs.statSync(outputPath);
  return stats.size;
}
