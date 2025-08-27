require('dotenv').config();
const express = require('express');
const app = express();
const port = 3000;

// Парсинг JSON (для Slack Events)
// Збільшуємо ліміт до 50MB, щоб обробляти великі транскрипти
app.use(express.json({ limit: '50mb' }));

// Парсинг form-urlencoded (для slash commands)
app.use(express.urlencoded({ extended: true }));

// Зміни тут: імпортуємо router та getMyBotId з оновленого slackHandler
const { router: slackHandlerRouter, getMyBotId } = require('./modules/slack/slackHandler');

// Імпортуємо report checker та slack client
const { initReportChecker } = require('./modules/slack/reportChecker');
const slackClient = require('./modules/slack/slackClient');
// Імпортуємо менеджерський алерт checker
const { initDailyCheck } = require('./modules/slack/managerAlertsHandler');
// Імпортуємо Harixx звіт checker
const { initDailyHarixxCheck } = require('./modules/slack/harixxReportHandler');
// Імпортуємо ReadAI handler
const readAIHandler = require('./modules/readAI/readAIHandler');

// Тестова маршрутка
app.get('/', (req, res) => {
  res.send('AI Assistant server is running!');
});

// Зміни тут: підключаємо Slack routes через імпортований router
app.use('/slack', slackHandlerRouter);

// Підключаємо ReadAI webhook route
app.use('/webhook/readAI', readAIHandler);

// Ініціалізуємо перевірку звітів
initReportChecker(slackClient);
// Ініціалізуємо щоденну перевірку менеджерських алертів
initDailyCheck();
// Ініціалізуємо щоденну перевірку Harixx звітів
initDailyHarixxCheck();

app.listen(port, async () => {
  console.log(`Server is running on http://localhost:${port}`);
  
  // Додано: викликаємо функцію для отримання ID нашого бота при запуску сервера
  await getMyBotId();
});
