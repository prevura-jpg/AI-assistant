// modules/gemini/geminiService.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

const API_KEY = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(API_KEY);

async function getGeminiSummary({ title, transcript, agenda, previousSummary, additionalMaterials, isSpecialMeeting }) {
  const maxRetries = 3;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

      let prompt;

      if (isSpecialMeeting) {
        // Короткий промт для "спеціальних" мітингів, включаючи аналіз Scrum-процесів для daily
        if (title.toLowerCase().includes('daily')) {
            prompt = `
Ви — AI-асистент, який створює стислі підсумки зустрічей українською мовою.

Правила:
1. Завжди повертати текст лише українською мовою.
2. Завжди повертати відповідь у форматі JSON. Жодного іншого тексту.
3. Аналізувати зустріч з точки зору Scrum-майстра.

Вхідні дані:
- Назва зустрічі: ${title || 'немає'}
- Розшифровка: ${transcript || 'немає'}

Завдання:
Проаналізуй вхідні дані та згенеруй короткий підсумок у форматі JSON із такою структурою:

{
  "summary": "Короткий опис, що було обговорено.",
  "action_items": ["перелік ключових завдань, якщо є"],
  "analysis": "Короткий аналіз зустрічі.",
  "scrum_master_recommendations": [
    {
      "area": "Назва області покращення (наприклад, 'Комунікація', 'Блокування', 'Довжина мітингу').",
      "recommendation": "Детальна рекомендація щодо покращення процесу."
    }
  ]
}
            `;
        } else {
            // Існуючий загальний промт для інших спеціальних мітингів (review, retrospective тощо)
            prompt = `
Ви — AI-асистент, який створює стислі підсумки зустрічей українською мовою.

Правила:
1. Завжди повертати текст лише українською мовою.
2. Завжди повертати відповідь у форматі JSON. Жодного іншого тексту.

Вхідні дані:
- Назва зустрічі: ${title || 'немає'}
- Розшифровка: ${transcript || 'немає'}

Завдання:
Проаналізуй вхідні дані та згенеруй короткий підсумок у форматі JSON із такою структурою:

{
  "summary": "Короткий опис, що було обговорено.",
  "action_items": ["перелік ключових завдань, якщо є"],
  "analysis": "Короткий аналіз зустрічі та 1-2 рекомендації щодо покращення."
}
            `;
        }
      } else {
        // Оновлений детальний промт для "звичайних" мітингів
        prompt = `
Ви — AI-асистент, який створює детальні та організовані протоколи зустрічей українською мовою.

Правила:
1. Завжди повертати текст лише українською мовою.
2. Автоматично визначати тип зустрічі на основі розшифровки (transcript) та порядку денного (agenda).
3. Завжди повертати відповідь у форматі JSON. Жодного іншого тексту.

Вхідні дані:
- Попередня зустріч: ${previousSummary || 'немає'}
- Порядок денний: ${agenda || 'немає'}
- Додаткові матеріали: ${additionalMaterials || 'немає'}
- Розшифровка: ${transcript || 'немає'}

Завдання:
Проаналізуй вхідні дані та згенеруй протокол зустрічі у форматі JSON із такою структурою:

{
  "summary": {
    "participants": [
      {
        "name": "повне ім'я учасника",
        "role": "роль (наприклад, менеджер, розробник), якщо її можна визначити"
      }
    ],
    "goal": "коротка мета зустрічі",
    "discussion": "стислий підсумок обговорення",
    "undiscussed_points": ["список пунктів, які не обговорювалися"],
    "off_topic_deviations": ["короткий опис відхилень від теми"]
  },
  "decisions": {
    "decisions_made": "опис прийнятих рішень"
  },
  "action_items": [
    {
      "task": "назва завдання",
      "assigned_to": "кому призначено",
      "deadline": "термін виконання"
    }
  ],
  "key_insights": {
    "data_and_insights": "ключові дані та інсайти",
    "next_steps": "наступні кроки"
  },
  "final_analysis": {
    "analysis": "фінальний аналіз зустрічі",
    "recommendations": "рекомендації щодо покращення ефективності"
  }
}
        `;
      }

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const jsonString = response.text().replace(/```json|```/g, '').trim();
      let parsedData;
      try {
        parsedData = JSON.parse(jsonString);
      } catch (e) {
        console.error("Помилка парсингу JSON від Gemini:", e);
        parsedData = {
          summary: "Не вдалося згенерувати підсумок. Виникла помилка.",
          action_items: []
        };
      }
      return parsedData;

    } catch (error) {
      if (error.status === 500 && retries < maxRetries - 1) {
        retries++;
        console.error(`Помилка на сервері Gemini (500). Повторна спроба #${retries}...`);
        await new Promise(res => setTimeout(res, 2000 * retries));
      } else {
        console.error('Помилка при генерації протоколу:', error);
        throw error;
      }
    }
  }
}

module.exports = { getGeminiSummary };