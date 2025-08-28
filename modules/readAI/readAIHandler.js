const express = require('express');
const router = express.Router();
const { handleMeetingSummary } = require('./readAIService');

// --- POST webhook ---
router.post('/', async (req, res) => {
  console.log('--- ReadAI Webhook Received ---');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);

  try {
    const payload = normalizeReadAIPayload(req.body);
    if (!payload) {
      console.warn('Payload unrecognized or missing required fields.');
      return res.status(400).json({ error: 'Bad Request', message: 'Unrecognized payload format' });
    }

    console.log(`Processing meeting: "${payload.title}" with host: ${payload.host_email}`);

    // Виклик основної логіки без змін
    await handleMeetingSummary(payload);

    console.log(`Successfully processed meeting: "${payload.title}"`);

    // Додатково можна логувати в базу або систему моніторингу
    // logProcessedMeeting(payload.meeting_id, 'processed');

    return res.status(200).json({ success: true, message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Error in ReadAI webhook handler:', error);

    // Додатковий алерт (Slack, email, тощо)
    // sendErrorAlert(error);

    return res.status(500).json({ error: 'Internal Server Error', message: 'Unexpected error occurred' });
  }
});

// --- Функція нормалізації payload ---
function normalizeReadAIPayload(body) {
  if (!body || typeof body !== 'object') return null;

  if (body.trigger && body.session_id) {
    const normalized = {
      meeting_id: body.session_id,
      title: body.title || 'Untitled meeting',
      transcript: body.transcript?.speaker_blocks?.map(b => b.words).join('\n') || null,
      summary: body.summary || null,
      action_items: body.action_items || [],
      key_questions: body.key_questions || [],
      topics: body.topics || [],
      host_email: body.owner?.email || null,
      participants: body.participants || [],
      timestamp: body.end_time || new Date().toISOString(),
      report_url: body.report_url || null,
    };
    console.log('Normalized payload:', normalized);
    return normalized;
  }

  console.warn('Body did not match expected ReadAI format:', body);
  return null;
}

module.exports = router;