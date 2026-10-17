export default async function handler(req, res) {
  const { text } = req.query;

  if (!text) {
    return res.status(400).send('Missing text parameter');
  }

  // Запит до Google Translate TTS із серверного боку Vercel (без блокувань CORS)
  const googleTTSUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=cs&client=tw-ob`;

  try {
    const response = await fetch(googleTTSUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (!response.ok) {
      return res.status(500).send('Failed to fetch audio from Google');
    }

    const audioBuffer = await response.arrayBuffer();

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(Buffer.from(audioBuffer));
  } catch (error) {
    return res.status(500).send(error.message);
  }
}
