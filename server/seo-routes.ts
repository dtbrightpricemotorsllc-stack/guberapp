import type { Express, Request, Response } from "express";
import { db } from "./db";
import { jobs as jobsTable } from "@shared/schema";
import { eq, and, or, desc, sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function parseLocation(locationApprox: string | null): { city: string; state: string } {
  if (!locationApprox) return { city: "Unknown", state: "US" };
  const match = locationApprox.match(/^(.+?),\s*([A-Z]{2})/i);
  if (match) return { city: match[1].trim(), state: match[2].toUpperCase() };
  const parts = locationApprox.replace(" area", "").split(",");
  return { city: parts[0]?.trim() || "Unknown", state: parts[1]?.trim()?.toUpperCase() || "US" };
}

function buildJobPostingJsonLd(job: any) {
  const loc = parseLocation(job.locationApprox);
  const validThrough = job.expiresAt
    ? new Date(job.expiresAt).toISOString()
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const schema: any = {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    "title": job.title,
    "description": job.description || job.title,
    "datePosted": job.createdAt ? new Date(job.createdAt).toISOString() : new Date().toISOString(),
    "validThrough": validThrough,
    "hiringOrganization": {
      "@type": "Organization",
      "name": "GUBER GLOBAL LLC",
      "sameAs": "https://guberapp.com",
      "logo": "https://guberapp.com/Guberapplogo.png",
    },
    "jobLocation": {
      "@type": "Place",
      "address": {
        "@type": "PostalAddress",
        "addressLocality": loc.city,
        "addressRegion": loc.state,
        "addressCountry": "US",
      },
    },
    "employmentType": "TEMPORARY",
    "url": `https://guberapp.app/public/jobs/${slugify(job.title)}-${slugify(loc.city)}-${loc.state.toLowerCase()}-${job.id}`,
  };

  if (job.budget && job.budget > 0) {
    schema.baseSalary = {
      "@type": "MonetaryAmount",
      "currency": "USD",
      "value": {
        "@type": "QuantitativeValue",
        "value": job.budget,
        "unitText": "HOUR",
      },
    };
  }

  return schema;
}

function buildJobPageHtml(job: any, template: string): string {
  const loc = parseLocation(job.locationApprox);
  const jsonLd = JSON.stringify(buildJobPostingJsonLd(job));
  const title = `${job.title} in ${loc.city}, ${loc.state} | GUBER`;
  const desc = (job.description || job.title).substring(0, 160);
  const slug = `${slugify(job.title)}-${slugify(loc.city)}-${loc.state.toLowerCase()}-${job.id}`;
  const url = `https://guberapp.app/public/jobs/${slug}`;
  const proofType = job.proofRequired ? "Photo/GPS verification required" : "Standard completion";

  const seoHead = `
    <title>${title}</title>
    <meta name="description" content="${desc}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${desc}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="https://guberapp.com/Guberapplogo.png" />
    <link rel="canonical" href="${url}" />
    <meta name="robots" content="index, follow" />
    <script type="application/ld+json">${jsonLd}</script>
  `;

  const bodyHtml = `
  <div id="seo-job-page" style="background:#0a0a0a;color:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;min-height:100vh;padding:0;">
    <header style="position:sticky;top:0;z-index:200;background:rgba(10,10,10,0.94);backdrop-filter:blur(14px);border-bottom:1px solid rgba(255,255,255,0.08);padding:13px 0;">
      <div style="max-width:1060px;margin:0 auto;padding:0 24px;display:flex;align-items:center;justify-content:space-between;">
        <a href="https://guberapp.com" style="display:flex;align-items:center;gap:9px;font-size:20px;font-weight:900;color:#00ff6a;text-decoration:none;">
          <img src="https://guberapp.com/Guberapplogo.png" alt="GUBER" style="width:32px;height:32px;" />GUBER
        </a>
        <div style="display:flex;gap:8px;">
          <a href="https://guberapp.app/login" style="padding:9px 16px;border-radius:10px;font-size:13px;font-weight:700;border:1.5px solid rgba(255,255,255,0.18);color:#b8b8b8;text-decoration:none;">Sign In</a>
          <a href="https://guberapp.app/signup" style="padding:9px 16px;border-radius:10px;font-size:13px;font-weight:700;background:#00ff6a;color:#000;text-decoration:none;">Sign Up</a>
        </div>
      </div>
    </header>
    <main style="max-width:720px;margin:0 auto;padding:40px 24px;">
      <div style="margin-bottom:8px;">
        <a href="https://guberapp.com/jobs" style="font-size:13px;color:#00ff6a;text-decoration:none;">← All Jobs</a>
      </div>
      <div style="display:inline-block;padding:4px 12px;border-radius:999px;font-size:11px;font-weight:700;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#b8b8b8;margin-bottom:14px;">${job.category}${job.serviceType ? ' · ' + job.serviceType : ''}</div>
      ${job.urgentSwitch ? '<span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;background:rgba(255,204,51,0.12);border:1px solid rgba(255,204,51,0.3);color:#ffcc33;margin-left:8px;margin-bottom:14px;">⚡ URGENT</span>' : ''}
      <h1 style="font-size:36px;font-weight:900;line-height:1.1;letter-spacing:-0.02em;margin-bottom:12px;">${job.title}</h1>
      <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:24px;">
        <div style="display:flex;align-items:center;gap:6px;font-size:14px;color:#b8b8b8;">📍 ${loc.city}, ${loc.state}</div>
        <div style="display:flex;align-items:center;gap:6px;font-size:14px;color:#b8b8b8;">📋 ${proofType}</div>
      </div>
      <div style="font-size:32px;font-weight:900;color:#00ff6a;margin-bottom:24px;">${job.budget ? '$' + job.budget.toFixed(2) : 'Barter'}</div>
      ${job.description ? `<div style="font-size:15px;color:#b8b8b8;line-height:1.72;margin-bottom:32px;padding:20px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:14px;">${job.description.replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</div>` : ''}
      <a href="https://guberapp.app/jobs/${job.id}" style="display:flex;align-items:center;justify-content:center;gap:8px;padding:16px 28px;border-radius:12px;font-size:16px;font-weight:700;background:#00ff6a;color:#000;text-decoration:none;margin-bottom:16px;">Take This Job →</a>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        <a href="https://guberapp.app/signup" style="flex:1;text-align:center;padding:13px 22px;border-radius:10px;font-size:14px;font-weight:700;border:1.5px solid rgba(255,255,255,0.18);color:#b8b8b8;text-decoration:none;">Post a Job</a>
        <a href="https://guberapp.com" style="flex:1;text-align:center;padding:13px 22px;border-radius:10px;font-size:14px;font-weight:700;border:1.5px solid rgba(255,255,255,0.18);color:#b8b8b8;text-decoration:none;">Back to GUBER</a>
      </div>
      <p style="font-size:12px;color:#666;margin-top:32px;text-align:center;">Posted ${job.createdAt ? new Date(job.createdAt).toLocaleDateString() : 'recently'} · GUBER GLOBAL LLC</p>
    </main>
  </div>`;

  let html = template;
  html = html.replace(/<title>.*?<\/title>/, '');
  html = html.replace('</head>', seoHead + '</head>');
  html = html.replace('<div id="root"></div>', `<div id="root"></div><div id="seo-fallback" style="display:none">${bodyHtml}</div>
  <script>if(!document.querySelector('#root [data-reactroot]')&&!document.querySelector('#root>*:not(#seo-fallback)')){document.getElementById('seo-fallback').style.display='block';}</script>`);

  return html;
}

export function setupPublicSeoRoutes(app: Express) {
  app.get("/public/jobs/:slug", async (req: Request, res: Response, next) => {
    try {
      const slug = req.params.slug;
      const idMatch = slug.match(/-(\d+)$/);
      if (!idMatch) return next();

      const jobId = parseInt(idMatch[1], 10);
      const rows = await db
        .select({
          id: jobsTable.id,
          title: jobsTable.title,
          description: jobsTable.description,
          category: jobsTable.category,
          budget: jobsTable.budget,
          locationApprox: jobsTable.locationApprox,
          zip: jobsTable.zip,
          urgentSwitch: jobsTable.urgentSwitch,
          payType: jobsTable.payType,
          jobType: jobsTable.jobType,
          proofRequired: jobsTable.proofRequired,
          serviceType: jobsTable.serviceType,
          verifyInspectCategory: jobsTable.verifyInspectCategory,
          expiresAt: jobsTable.expiresAt,
          status: jobsTable.status,
          createdAt: jobsTable.createdAt,
        })
        .from(jobsTable)
        .where(eq(jobsTable.id, jobId))
        .limit(1);

      if (!rows.length || rows[0].status === "draft") return next();

      const job = rows[0];

      let template: string;
      if (process.env.NODE_ENV === "production") {
        const distPath = path.resolve(__dirname, "public", "index.html");
        template = fs.readFileSync(distPath, "utf-8");
      } else {
        const clientPath = path.resolve(import.meta.dirname, "..", "client", "index.html");
        template = fs.readFileSync(clientPath, "utf-8");
      }

      const html = buildJobPageHtml(job, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (err) {
      console.error("[seo] /public/jobs/:slug error:", err);
      next();
    }
  });

  app.get("/sitemap.xml", async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select({
          id: jobsTable.id,
          title: jobsTable.title,
          locationApprox: jobsTable.locationApprox,
          category: jobsTable.category,
          createdAt: jobsTable.createdAt,
        })
        .from(jobsTable)
        .where(
          and(
            eq(jobsTable.status, "posted_public"),
            or(sql`${jobsTable.expiresAt} IS NULL`, sql`${jobsTable.expiresAt} > NOW()`)
          )
        )
        .orderBy(desc(jobsTable.createdAt))
        .limit(1000);

      const cities = new Set<string>();
      const categories = new Set<string>();

      let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

      xml += `  <url><loc>https://guberapp.com/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n`;
      xml += `  <url><loc>https://guberapp.com/jobs</loc><changefreq>hourly</changefreq><priority>0.9</priority></url>\n`;

      for (const job of rows) {
        const loc = parseLocation(job.locationApprox);
        const slug = `${slugify(job.title)}-${slugify(loc.city)}-${loc.state.toLowerCase()}-${job.id}`;
        const lastmod = job.createdAt ? new Date(job.createdAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
        xml += `  <url><loc>https://guberapp.com/jobs/${slug}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>\n`;
        xml += `  <url><loc>https://guberapp.app/public/jobs/${slug}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>\n`;
        cities.add(`${slugify(loc.city)}-${loc.state.toLowerCase()}`);
        categories.add(slugify(job.category));
      }

      for (const city of cities) {
        xml += `  <url><loc>https://guberapp.com/${city}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>\n`;
      }

      const categoryNames = ["on-demand-help", "general-labor", "skilled-labor", "verify-and-inspect", "barter-labor", "marketplace"];
      for (const cat of categoryNames) {
        xml += `  <url><loc>https://guberapp.com/category/${cat}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>\n`;
      }

      xml += `</urlset>`;

      res.set("Content-Type", "application/xml").send(xml);
    } catch (err) {
      console.error("[seo] /sitemap.xml error:", err);
      res.status(500).send("Error generating sitemap");
    }
  });
}
