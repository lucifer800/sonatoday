/*
  rateUrls.js — id → official daily-rate page for each verified jeweller.
  Keep this in sync with the rate_url field in /data.js so the scraper
  and the public profile badge point at the same place.
*/
module.exports = {
  1:  'https://www.malabargoldanddiamonds.com/goldprice',
  2:  null,    // TBZ — no dedicated public rate page; rate self-reported via dashboard
  3:  'https://www.tanishq.co.in/gold-rate.html',
  4:  'https://www.kalyanjewellers.net/kalyan_gold_rates/gold-rate/todays-gold-rate-in-ahmedabad',
  5:  'https://www.joyalukkas.in/goldrate',
  6:  'https://www.caratlane.com/gold-rate/gujarat/ahmedabad-gold-rate-today',
  7:  'https://www.grtjewels.com/today-gold-rate',
  8:  'https://sencogoldanddiamonds.com/gold-price-calculator',
  9:  null,    // Reliance Jewels — no public daily-rate page; rate self-reported
  10: 'https://dg.pcjeweller.com/',
  11: 'https://pngadgilandsons.com/png-todays-gold-rates/',
  12: 'https://www.bhima.com/gold-rate-today',
};
