const express = require('express');
const router = express.Router();
const { handleMeetingSummary } = require('./readAIService');

router.post('/', async (req, res) => {
  console.log('Received ReadAI webhook request');

  try {
    const payload = normalizeReadAIPayload(req.body);
    if (!payload) return res.status(400).json({ error: 'Bad Request', message: 'Unrecognized payload format' });

    await handleMeetingSummary(payload);
    return res.status(200).json({ success: true, message: 'Webhook processed successfully' });
  } catch (error) {
    console.error('Unexpected error in ReadAI webhook handler:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: 'Unexpected error occurred' });
  }
});

function normalizeReadAIPayload(body) {
  if (!body || typeof body !== 'object') return null;

  if (body.trigger && body.session_id) {
    return {
      meeting_id: body.session_id,
      title: body.title || 'Untitled meeting',
      transcript: body.transcript?.speaker_blocks.map(b => b.words).join('\n') || null,
      summary: body.summary || null,
      action_items: body.action_items || [],
      key_questions: body.key_questions || [],
      topics: body.topics || [],
      host_email: body.owner?.email || null,
      participants: body.participants || [],
      timestamp: body.end_time || new Date().toISOString(),
      report_url: body.report_url || null, // Додано для повної URL-адреси звіту
    };
  }

  return null;
}

module.exports = router;