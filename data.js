/* =========================================================
   Shared jeweller dataset — loaded by both index.html and
   jeweller.html so the two pages stay in sync.

   ─── STRICT NO-FAKE-DATA POLICY ─────────────────────────
   This file contains ONLY immutable jeweller identity data:
   id, name, symbol, email, area, and the URL where their
   public rate page lives.

   Everything else — rates, reviews, phone numbers, "updated
   at" timestamps — is null at load time and gets populated
   from the live backend via syncJewellersFromDB(). If we
   have no real data for a field, the UI shows "—".
   No hardcoded prices. No fake reviews. No fabricated
   contact info.
   ========================================================= */

const J = [
  { id:1,  name:'Malabar Gold & Diamonds', sym:'MGL', email:'malabar@ahm.com',   pass:'pass123', area:'Prahlad Nagar', phone:null, active:true, r22g:null, r24g:null, making:null, updated:null, rate_url:'https://www.malabargoldanddiamonds.com/goldprice', reviews:[] },
  { id:2,  name:'TBZ – The Original',      sym:'TBZ', email:'tbz@ahm.com',        pass:'pass123', area:'C.G. Road',      phone:null, active:true, r22g:null, r24g:null, making:null, updated:null, rate_url:'https://tbztheoriginal.com/', reviews:[] },
  { id:3,  name:'Tanishq',                 sym:'TNQ', email:'tanishq@ahm.com',    pass:'pass123', area:'C.G. Road',      phone:null, active:true, r22g:null, r24g:null, making:null, updated:null, rate_url:'https://www.tanishq.co.in/gold-rate.html', reviews:[] },
  { id:4,  name:'Kalyan Jewellers',        sym:'KJW', email:'kalyan@ahm.com',     pass:'pass123', area:'Vastrapur',      phone:null, active:true, r22g:null, r24g:null, making:null, updated:null, rate_url:'https://www.kalyanjewellers.net/kalyan_gold_rates/gold-rate/todays-gold-rate-in-ahmedabad', reviews:[] },
  { id:5,  name:'Joyalukkas',              sym:'JYL', email:'joyalukkas@ahm.com', pass:'pass123', area:'Satellite',      phone:null, active:true, r22g:null, r24g:null, making:null, updated:null, rate_url:'https://www.joyalukkas.in/goldrate', reviews:[] },
  { id:6,  name:'CaratLane',               sym:'CTL', email:'caratlane@ahm.com',  pass:'pass123', area:'Bodakdev',       phone:null, active:true, r22g:null, r24g:null, making:null, updated:null, rate_url:'https://www.caratlane.com/gold-rate/gujarat/ahmedabad-gold-rate-today', reviews:[] },
  { id:7,  name:'GRT Jewellers',           sym:'GRT', email:'grt@ahm.com',        pass:'pass123', area:'Ashram Road',    phone:null, active:true, r22g:null, r24g:null, making:null, updated:null, rate_url:'https://www.grtjewels.com/today-gold-rate', reviews:[] },
  { id:8,  name:'Senco Gold & Diamonds',   sym:'SGD', email:'senco@ahm.com',      pass:'pass123', area:'Maninagar',      phone:null, active:true, r22g:null, r24g:null, making:null, updated:null, rate_url:'https://sencogoldanddiamonds.com/gold-rate-today', reviews:[] },
  { id:9,  name:'Reliance Jewels',         sym:'RJL', email:'reliance@ahm.com',   pass:'pass123', area:'Shahibaug',      phone:null, active:true, r22g:null, r24g:null, making:null, updated:null, rate_url:'https://www.reliancejewels.com/gold-rate-today', reviews:[] },
  { id:10, name:'PC Jeweller',             sym:'PCJ', email:'pcj@ahm.com',        pass:'pass123', area:'S.G. Highway',   phone:null, active:true, r22g:null, r24g:null, making:null, updated:null, rate_url:'https://dg.pcjeweller.com/', reviews:[] },
  { id:11, name:'P.N. Gadgil & Sons',      sym:'PNG', email:'png@ahm.com',        pass:'pass123', area:'Navrangpura',    phone:null, active:true, r22g:null, r24g:null, making:null, updated:null, rate_url:'https://pngadgilandsons.com/png-todays-gold-rates/', reviews:[] },
  { id:12, name:'Bhima Jewellers',         sym:'BHM', email:'bhima@ahm.com',      pass:'pass123', area:'Law Garden',     phone:null, active:true, r22g:null, r24g:null, making:null, updated:null, rate_url:'https://www.bhima.com/gold-rate-today', reviews:[] },
];

/* Silver = scaled-down rates. Null-safe so a jeweller without a
   scraped gold rate also shows null (not NaN) for silver. */
const JS = J.map(j => ({
  ...j,
  r22g:   j.r22g   != null ? Math.round(j.r22g * 0.012) : null,
  r24g:   j.r24g   != null ? Math.round(j.r24g * 0.012) : null,
  making: j.making != null ? Math.max(6, j.making - 3) : null,
}));
