const SettingsRepo = require('../models/settingsRepo');
const JobRepo = require('../models/jobRepo');
const AuditRepo = require('../models/auditRepo');
const MetaLeads = require('../services/metaLeadsService');
const LeadIngestion = require('../services/leadIngestion');
const SheetImport = require('../services/sheetImport');

// @desc    Verify the saved Meta token + page (leads_retrieval reachability)
// @route   POST /api/integrations/meta/test
// @access  Private (Admin)
exports.testMeta = async (req, res) => {
  try {
    const settings = await SettingsRepo.get();
    if (!MetaLeads.isConfigured(settings)) {
      return res.status(400).json({ success: false, message: 'Add a Meta access token and Page ID first.' });
    }
    const info = await MetaLeads.testConnection(settings);
    return res.json({
      success: true,
      data: info,
      message: info.leadgenTosAccepted
        ? `Connected to "${info.pageName}".`
        : `Connected to "${info.pageName}", but the Page has NOT accepted the Lead-Gen Terms of Service — leads can't be read until it does.`,
    });
  } catch (err) {
    return res.status(err.status || 502).json({ success: false, code: err.code || 'META_FAILED', message: err.message });
  }
};

// @desc    List the Page's Meta lead forms (for form→job mapping)
// @route   GET /api/integrations/meta/forms
// @access  Private (Admin)
exports.getMetaForms = async (req, res) => {
  try {
    const settings = await SettingsRepo.get();
    if (!MetaLeads.isConfigured(settings)) {
      return res.status(400).json({ success: false, message: 'Add a Meta access token and Page ID first.' });
    }
    const forms = await MetaLeads.listLeadForms(settings);
    return res.json({ success: true, count: forms.length, data: forms });
  } catch (err) {
    return res.status(err.status || 502).json({ success: false, code: err.code || 'META_FAILED', message: err.message });
  }
};

// @desc    Map (or unmap) a Meta lead form to a job
// @route   POST /api/integrations/meta/map   body: { jobId, formId|null }
// @access  Private (Admin)
exports.mapMetaForm = async (req, res) => {
  try {
    const { jobId, formId } = req.body;
    if (!jobId) return res.status(400).json({ success: false, message: 'A jobId is required.' });
    const job = await JobRepo.findById(jobId);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });
    // One form maps to exactly one job — clear it from any other job first.
    if (formId) await JobRepo.clearMetaFormEverywhere(String(formId));
    const updated = await JobRepo.setMetaForm(jobId, formId ? String(formId) : null);
    AuditRepo.log(req.user, 'integration.meta_map', {
      entityType: 'job', entityId: jobId,
      summary: formId ? `Linked Meta form ${formId} → "${job.title}"` : `Unlinked Meta form from "${job.title}"`,
    });
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Map Meta form error:', err);
    return res.status(500).json({ success: false, message: 'Server error mapping the lead form.' });
  }
};

// @desc    Manually pull new leads now (same work the background poll does)
// @route   POST /api/integrations/meta/sync
// @access  Private (Admin)
exports.syncNow = async (req, res) => {
  try {
    const settings = await SettingsRepo.get();
    if (!MetaLeads.isConfigured(settings)) {
      return res.status(400).json({ success: false, message: 'Meta Lead Ads is not configured.' });
    }
    const summary = await LeadIngestion.syncAll(settings);
    AuditRepo.log(req.user, 'integration.meta_sync', {
      entityType: 'settings',
      summary: `Meta sync: ${summary.created} new, ${summary.skipped} skipped across ${summary.jobsSynced} form(s)`,
      meta: summary,
    });
    const msg = summary.jobsSynced === 0
      ? 'No jobs are linked to a Meta lead form yet — map one below first.'
      : `Synced ${summary.jobsSynced} form(s): ${summary.created} new candidate(s), ${summary.whatsapp} WhatsApp request(s) sent.`;
    return res.json({ success: summary.errors.length === 0, data: summary, message: msg });
  } catch (err) {
    console.error('Meta sync error:', err);
    return res.status(500).json({ success: false, message: 'Server error running the sync.' });
  }
};

// @desc    Import leads from an uploaded CSV → create candidates + WhatsApp request
// @route   POST /api/integrations/leads/import   (multipart: file, jobId)
// @access  Private (Admin)
exports.importLeads = async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ success: false, message: 'Choose a job for these leads.' });
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'Attach a .csv file of leads.' });
    }
    const job = await JobRepo.findById(jobId);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found.' });

    const settings = await SettingsRepo.get();
    const summary = await SheetImport.importCsvLeads(settings, job, req.file.buffer, req.user);

    const waNote = WhatsAppConfigured(settings)
      ? `${summary.whatsappSent} WhatsApp request(s) sent`
      : 'WhatsApp is not configured yet, so no request messages were sent';
    const msg =
      `Imported ${summary.created} new lead(s), ${summary.duplicates} duplicate(s) skipped` +
      (summary.skippedNoContact ? `, ${summary.skippedNoContact} row(s) without a phone or email` : '') +
      ` into "${job.title}". ${waNote}.`;
    return res.json({ success: summary.errors.length === 0, data: summary, message: msg });
  } catch (err) {
    console.error('Lead import error:', err);
    return res.status(500).json({ success: false, message: 'Server error importing the sheet.' });
  }
};

// Local helper so the message can distinguish "no sends because unconfigured".
const WhatsAppConfigured = (settings) =>
  Boolean(settings && settings.whatsappAccessToken && settings.whatsappPhoneNumberId && settings.whatsappTemplateName);
