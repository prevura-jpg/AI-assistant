const slackClient = require('../slack/slackClient');
const { getGeminiSummary } = require('../gemini/geminiService');

async function handleMeetingSummary(payload) {
  try {
    const { title, transcript, host_email } = payload;
    const myEmail = process.env.MY_EMAIL;
    if (myEmail && host_email !== myEmail && !payload.participants?.some(p => p.email === myEmail)) {
      console.log('Ignoring meeting — not my meeting and I am not a participant.');
      return;
    }

    const meetingType = determineMeetingType(title, transcript);
    const targetChannel = (meetingType === 'regular') ? process.env.SLACK_SUMMARY_CHANNEL_ID : process.env.SLACK_SPECIAL_CHANNEL_ID;

    const aiSummary = await getGeminiSummary({ 
      title, 
      transcript, 
      ...payload, 
      isSpecialMeeting: (meetingType === 'special') 
    });

    const slackSummary = generateSummaryBlocks(title, aiSummary, payload);
    await postSummaryToSlack(slackSummary, targetChannel);

    console.log('Meeting summary successfully posted to Slack');
  } catch (err) {
    console.error('Error in handleMeetingSummary:', err);
    throw err;
  }
}

function determineMeetingType(title, transcript) {
  const specialKeywords = ['daily', 'review', 'retrospective', 'workshop', 'planning'];
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

      // Нова логіка для рекомендацій від Scrum-майстра
      if (summaryData.scrum_master_recommendations?.length) {
          const recommendationsText = summaryData.scrum_master_recommendations.map(rec => `*${rec.area}:* ${rec.recommendation}`).join('\n\n');
          blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Рекомендації Scrum-майстра:*\n${recommendationsText}` } });
      }
  } 
  // Логіка для звичайних мітингів (детальний формат)
  else {
      if (summaryData.summary) {
          const summaryText = `*Учасники:* ${summaryData.summary.participants?.join(', ') || 'Не вказано'}\n*Мета зустрічі:* ${summaryData.summary.goal || 'Не вказано'}\n*Обговорення:* ${summaryData.summary.discussion || 'Не вказано'}\n*Нерозглянуті пункти:* ${summaryData.summary.undiscussed_points?.map(p => `• ${p}`).join('\n') || 'Немає'}\n*Відхилення від теми:* ${summaryData.summary.off_topic_deviations?.map(d => `• ${d}`).join('\n') || 'Немає'}`;
          blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*AI Summary:*\n${summaryText}` } });
      }

      if (summaryData.decisions?.decisions_made) {
          blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Прийняті рішення:*\n${summaryData.decisions.decisions_made}` } });
      }

      if (summaryData.action_items?.length) {
          const tableHeader = '| Task | Assigned To | Deadline |\n|:---|:---:|:---:|\n';
          const tableRows = summaryData.action_items.map(item => `| ${item.task || '—'} | ${item.assigned_to || '—'} | ${item.deadline || '—'} |`).join('\n');
          blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `*Дії:*\n${tableHeader}${tableRows}` } });
      }

      if (summaryData.key_insights) {
          const insightsText = `*Ключові дані та insights:* ${summaryData.key_insights.data_and_insights || 'Немає'}\n*Наступні кроки:* ${summaryData.key_insights.next_steps || 'Немає'}`;
          blocks.push({ type: 'section', text: { type: 'mrkdwn', text: insightsText } });
      }

      if (summaryData.final_analysis) {
          const analysisText = `*Фінальний аналіз:* ${summaryData.final_analysis.analysis || 'Немає'}\n*Рекомендації щодо покращення ефективності:* ${summaryData.final_analysis.recommendations || 'Немає'}`;
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