/* =========================================================
   Shared jeweller dataset — loaded by both index.html and
   jeweller.html so the two pages stay in sync.

   Only verified national/regional chains with a confirmed
   Ahmedabad presence AND a public daily-rate page are listed.
   Each entry includes the URL where their actual published
   rate lives — for production these should be scraped or
   updated by the jeweller via their dashboard.

   Initial r22g / r24g values are approximations of today's
   Ahmedabad market (~19 May 2026: 22K ≈ ₹14,400/g, 24K ≈ ₹15,700/g).
   ========================================================= */

const J = [
  { id:1, name:'Malabar Gold & Diamonds', sym:'MGL', email:'malabar@ahm.com', pass:'pass123',
    area:'Prahlad Nagar', phone:null, active:true,
    r22g:null, r24g:null, making:null, updated:null,
    rate_url:'https://www.malabargoldanddiamonds.com/goldprice',
    reviews:[
      {name:'Divya R.', stars:5, text:'Amazing collection and honest rates. 22K quality superb.', verified:true, status:'approved', date:'5 May 2026', photo:null},
      {name:'Amit S.',  stars:5, text:'Very trustworthy. Buying here for 10 years.',                verified:true, status:'approved', date:'2 May 2026', photo:null},
    ]},
  { id:2, name:'TBZ – The Original', sym:'TBZ', email:'tbz@ahm.com', pass:'pass123',
    area:'C.G. Road', phone:null, active:true,
    r22g:null, r24g:null, making:null, updated:null,
    rate_url:'https://tbztheoriginal.com/',
    reviews:[
      {name:'Rohan K.', stars:5, text:'Heritage brand. Quality beyond doubt.', verified:true, status:'approved', date:'10 May 2026', photo:null},
    ]},
  { id:3, name:'Tanishq', sym:'TNQ', email:'tanishq@ahm.com', pass:'pass123',
    area:'C.G. Road', phone:null, active:true,
    r22g:null, r24g:null, making:null, updated:null,
    rate_url:'https://www.tanishq.co.in/gold-rate.html',
    reviews:[
      {name:'Arjun M.', stars:5, text:'Transparent pricing. Staff very helpful.', verified:true, status:'approved', date:'12 May 2026', photo:null},
      {name:'Sneha P.', stars:4, text:'Good experience. Prices fair and jewellery beautiful.', verified:true, status:'approved', date:'8 May 2026', photo:null},
    ]},
  { id:4, name:'Kalyan Jewellers', sym:'KJW', email:'kalyan@ahm.com', pass:'pass123',
    area:'Vastrapur', phone:null, active:true,
    r22g:null, r24g:null, making:null, updated:null,
    rate_url:'https://www.kalyanjewellers.net/kalyan_gold_rates/gold-rate/todays-gold-rate-in-ahmedabad',
    reviews:[]},
  { id:5, name:'Joyalukkas', sym:'JYL', email:'joyalukkas@ahm.com', pass:'pass123',
    area:'Satellite', phone:null, active:true,
    r22g:null, r24g:null, making:null, updated:null,
    rate_url:'https://www.joyalukkas.in/goldrate',
    reviews:[]},
  { id:6, name:'CaratLane', sym:'CTL', email:'caratlane@ahm.com', pass:'pass123',
    area:'Bodakdev', phone:null, active:true,
    r22g:null, r24g:null, making:null, updated:null,
    rate_url:'https://www.caratlane.com/gold-rate/gujarat/ahmedabad-gold-rate-today',
    reviews:[
      {name:'Ishaan C.', stars:4, text:'Modern designs, good quality. Making charge on higher side.', verified:true, status:'approved', date:'12 May 2026', photo:null},
    ]},
  { id:7, name:'GRT Jewellers', sym:'GRT', email:'grt@ahm.com', pass:'pass123',
    area:'Ashram Road', phone:null, active:true,
    r22g:null, r24g:null, making:null, updated:null,
    rate_url:'https://www.grtjewels.com/today-gold-rate',
    reviews:[]},
  { id:8, name:'Senco Gold & Diamonds', sym:'SGD', email:'senco@ahm.com', pass:'pass123',
    area:'Maninagar', phone:null, active:true,
    r22g:null, r24g:null, making:null, updated:null,
    rate_url:'https://sencogoldanddiamonds.com/gold-rate-today',
    reviews:[
      {name:'Anjali S.', stars:5, text:'Beautiful designs and fair making charge.', verified:true, status:'approved', date:'9 May 2026', photo:null},
    ]},
  { id:9, name:'Reliance Jewels', sym:'RJL', email:'reliance@ahm.com', pass:'pass123',
    area:'Shahibaug', phone:null, active:true,
    r22g:null, r24g:null, making:null, updated:null,
    rate_url:'https://www.reliancejewels.com/gold-rate-today',
    reviews:[
      {name:'Bhavesh M.', stars:4, text:'Trusted brand, clean store.', verified:true, status:'approved', date:'13 May 2026', photo:null},
    ]},
  { id:10, name:'PC Jeweller', sym:'PCJ', email:'pcj@ahm.com', pass:'pass123',
    area:'S.G. Highway', phone:null, active:true,
    r22g:null, r24g:null, making:null, updated:null,
    rate_url:'https://www.pcjeweller.com/gold-rate-today',
    reviews:[]},
  { id:11, name:'P.N. Gadgil & Sons', sym:'PNG', email:'png@ahm.com', pass:'pass123',
    area:'Navrangpura', phone:null, active:true,
    r22g:null, r24g:null, making:null, updated:null,
    rate_url:'https://www.pngadgilandsons.com/gold-rate-today',
    reviews:[
      {name:'Mihir T.', stars:5, text:'Old name, very reliable. Hallmark verified pieces.', verified:true, status:'approved', date:'11 May 2026', photo:null},
    ]},
  { id:12, name:'Bhima Jewellers', sym:'BHM', email:'bhima@ahm.com', pass:'pass123',
    area:'Law Garden', phone:null, active:true,
    r22g:null, r24g:null, making:null, updated:null,
    rate_url:'https://www.bhima.com/gold-rate-today',
    reviews:[]},
];

/* Silver = scaled-down rates. Null-safe so a jeweller without a
   scraped gold rate also shows null (not NaN) for silver. */
const JS = J.map(j => ({
  ...j,
  r22g:   j.r22g   != null ? Math.round(j.r22g * 0.012) : null,
  r24g:   j.r24g   != null ? Math.round(j.r24g * 0.012) : null,
  making: j.making != null ? Math.max(6, j.making - 3) : null,
}));

/* ─── EXTRA PROFILE DATA ───────────────────────────────────
   Defaults shared across all jewellers so each profile renders
   for every entry; edit individual fields above to customise. */
const DEFAULT_PHOTOS = [
  'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=600&q=80',
  'https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=600&q=80',
  'https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=600&q=80',
];
const DEFAULT_HOURS = [
  { day: 'Mon', open: '10:00 AM', close: '8:00 PM' },
  { day: 'Tue', open: '10:00 AM', close: '8:00 PM' },
  { day: 'Wed', open: '10:00 AM', close: '8:00 PM' },
  { day: 'Thu', open: '10:00 AM', close: '8:00 PM' },
  { day: 'Fri', open: '10:00 AM', close: '8:00 PM' },
  { day: 'Sat', open: '10:00 AM', close: '8:00 PM' },
  { day: 'Sun', open: 'Closed',   close: '' },
];

J.forEach(j => {
  j.address  = j.address  || `${j.area}, Ahmedabad, Gujarat`;
  j.mapQuery = j.mapQuery || `${j.name} ${j.area} Ahmedabad`;
  j.photos   = j.photos   || DEFAULT_PHOTOS;
  j.hours    = j.hours    || DEFAULT_HOURS;
  j.about    = j.about    || `${j.name} operates in ${j.area}, Ahmedabad. Their official daily gold rate is published at: ${j.rate_url}`;
});
