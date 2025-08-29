// modules/readAI/readAIService.js
const slackClient = require('../slack/slackClient');
const { getGeminiSummary } = require('../gemini/geminiService');

async function handleMeetingSummary(payload) {
  try {
    const { title, transcript, host_email, participants } = payload;
    const myEmail = process.env.MY_EMAIL;
    if (myEmail && host_email !== myEmail && !participants?.some(p => p.email === myEmail)) {
      console.log('Ignoring meeting — not my meeting and I am not a participant.');
      return;
    }

    const meetingType = determineMeetingType(title, transcript);
    const targetChannel = (meetingType === 'regular') ? process.env.SLACK_SUMMARY_CHANNEL_ID : process.env.SLACK_SPECIAL_CHANNEL_ID;

    console.log(`Generating summary for meeting "${title}"...`);
    
    const aiSummary = await getGeminiSummary({ 
      title, 
      transcript, 
      ...payload, 
      isSpecialMeeting: (meetingType === 'special') 
    });

    const slackSummary = generateSummaryBlocks(title, aiSummary, payload);
    await postSummaryToSlack(slackSummary, targetChannel);

    console.log(`Meeting summary for "${title}" successfully posted to Slack.`);
  } catch (err) {
    console.error('Error in handleMeetingSummary:', err);
    throw err;
  }
}

function determineMeetingType(title, transcript) {
  const specialKeywords = ['daily', 'review', 'retrospective', 'workshop', 'planning', 'cheсk-in'];
  const titleLower = title.toLowerCase();
  
  if (specialKeywords.some(keyword => titleLower.includes(keyword))) {
    return 'special';
  }
  return 'regular';
}

function generateSummaryBlocks(title, summaryData, payload) {
  const blocks = [];
  blocks.push({ type: 'header', text: { type: 'plain_text', text: `📅 ${title || 'Untitled Meeting'}` } });

  // Логіка для спеціальних мітингів (короткий формат)
  if (summaryData.summary && typeof summaryData.summary === 'string') {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Що було обговорено:*\n${summaryData.summary || 'Немає інформації.'}` } });
      
      if (summaryData.action_items?.length) {
          blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Дії:*\n${summaryData.action_items.map(i => `• ${i}`).join('\n')}` } });
      }
      
      if (summaryData.analysis) {
          blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Аналіз:*\n${summaryData.analysis}` } });
      }

      if (summaryData.scrum_master_recommendations?.length) {
          const recommendationsText = summaryData.scrum_master_recommendations.map(rec => `*${rec.area}:* ${rec.recommendation}`).join('\n\n');
          blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Рекомендації Scrum-майстра:*\n${recommendationsText}` } });
      }
  } 
  // Логіка для звичайних мітингів (детальний формат)
  else {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*AI Summary:*` } });

      if (summaryData.summary) {
          if (summaryData.summary.participants?.length) {
              const participantsText = summaryData.summary.participants.join(', ');
              blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Учасники:*\n${participantsText}` } });
          }
          if (summaryData.summary.goal) {
              blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Мета зустрічі:*\n${summaryData.summary.goal}` } });
          }
          if (summaryData.summary.discussion) {
              blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Обговорення:*\n${summaryData.summary.discussion}` } });
          }
          if (summaryData.summary.undiscussed_points?.length) {
              const undiscussedPointsText = summaryData.summary.undiscussed_points.map(p => `• ${p}`).join('\n');
              blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Нерозглянуті пункти:*\n${undiscussedPointsText}` } });
          }
          if (summaryData.summary.off_topic_deviations?.length) {
              const offTopicText = summaryData.summary.off_topic_deviations.map(d => `• ${d}`).join('\n');
              blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Відхилення від теми:*\n${offTopicText}` } });
          }
      }

      if (summaryData.decisions?.decisions_made) {
          blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Прийняті рішення:*\n${summaryData.decisions.decisions_made}` } });
      }

      if (summaryData.action_items?.length) {
          const actionItemsText = summaryData.action_items.map(item => 
              `*Завдання:* ${item.task || '—'}\n*Кому призначено:* ${item.assigned_to || '—'}\n*Термін:* ${item.deadline || '—'}`
          ).join('\n\n');
          blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Дії:*\n\n${actionItemsText}` } });
      }

      if (summaryData.key_insights) {
          const insightsText = `*Ключові дані та insights:*\n${summaryData.key_insights.data_and_insights || 'Немає'}\n\n*Наступні кроки:*\n${summaryData.key_insights.next_steps || 'Немає'}`;
          blocks.push({ type: 'section', text: { type: 'mrkdwn', text: insightsText } });
      }

      if (summaryData.final_analysis) {
          const analysisText = `*Фінальний аналіз:*\n${summaryData.final_analysis.analysis || 'Немає'}\n\n*Рекомендації щодо покращення ефективності:*\n${summaryData.final_analysis.recommendations || 'Немає'}`;
          blocks.push({ type: 'section', text: { type: 'mrkdwn', text: analysisText } });
      }
  }

  blocks.push({ type: 'section', text: { type: 'mrkdwn', text: payload.report_url ? `<${payload.report_url}|View Full ReadAI Report>` : '_Full report URL not provided_' } });
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `📊 *Generated by ReadAI + Gemini AI* • 🕐 ${new Date().toLocaleString()}` }] });

  return { text: `Meeting Summary: ${title}`, blocks };
}

async function postSummaryToSlack(summary, channelId) {
    if (!channelId) throw new Error('SLACK_CHANNEL_ID not configured');
    
    const MAX_SLACK_CHARS = 2900;
    let currentMessageBlocks = [];
    let currentMessageLength = 0;
    let messageCounter = 1;
  
    for (const block of summary.blocks) {
      const blockTextLength = block.text?.text.length || 0;
  
      if (currentMessageLength + blockTextLength > MAX_SLACK_CHARS && currentMessageBlocks.length > 0) {
        await slackClient.chat.postMessage({
          channel: channelId,
          text: `Частина ${messageCounter}: ${summary.text}`,
          blocks: currentMessageBlocks,
          unfurl_links: false,
        });
        console.log(`Posted message part ${messageCounter}`);
  
        messageCounter++;
        currentMessageBlocks = [block];
        currentMessageLength = blockTextLength;
      } else {
        currentMessageBlocks.push(block);
        currentMessageLength += blockTextLength;
      }
    }
  
    if (currentMessageBlocks.length > 0) {
      await slackClient.chat.postMessage({
        channel: channelId,
        text: `Частина ${messageCounter}: ${summary.text}`,
        blocks: currentMessageBlocks,
        unfurl_links: false,
      });
      console.log(`Posted final message part ${messageCounter}`);
    }
}

module.exports = { handleMeetingSummary };