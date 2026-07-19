/* ===================================================================
   TOP PEP — catalog data.
   EUR prices from ENGLISH_TOP_Pep.pdf, RON (lei) prices from RO_TOP.pdf,
   Janoshik COA test images from /Janotest, product photos from
   /Produktbilder. Categories: Peptides / Capsules / Lab Supplies / Topicals.
=================================================================== */
(function () {
  'use strict';

  /* first visit: pick the language from the visitor's browser locale */
  if (!localStorage.getItem('toppep_lang')) {
    var navLang = (navigator.language || (navigator.languages && navigator.languages[0]) || '').toLowerCase();
    localStorage.setItem('toppep_lang', navLang.indexOf('de') === 0 ? 'de' : navLang.indexOf('ro') === 0 ? 'ro' : 'en');
  }

  /* currency follows language: Romanian → lei, else → euro */
  var CUR = (localStorage.getItem('toppep_lang') === 'ro') ? 'ron' : 'eur';

  /* =================================================================
     PAYMENT CONFIG — single source of truth for bank-transfer details.
     Referenced by the checkout confirmation, order emails and /admin/.
  ================================================================= */
  var PAYMENT_BANK_DETAILS = {
    accountName: 'Petru Birgauan',
    iban: 'BE37 9050 9304 4528',
    bic: 'TRWIBEB1XXX',
    bank: 'Wise (TransferWise)'
  };
  var ORDER_INBOX = 'orders@top-pep.com';
  /* Phase 2: the deployed Cloudflare Worker (order records + Stripe checkout).
     While empty, orders are recorded via email + localStorage only, and card
     payment stays hidden (Stripe needs the Worker to run). */
  var ORDER_API_URL = 'https://order-api.top-pep.workers.dev';
  /* Stripe PUBLISHABLE key — safe to expose in the browser (pk_...).
     The SECRET key (sk_...) must NEVER live here; it goes in the Worker only
     via `wrangler secret put STRIPE_SECRET_KEY`. Card payment appears at
     checkout once BOTH this and ORDER_API_URL are set. */
  var STRIPE_PUBLISHABLE_KEY = 'pk_live_51Tg51UP45TQiZZmgZs5PmOjkkbxZNHZxKEZzF0WH4tZu8qjSz2K3XRFs9gmkqOQ05QFuqnJ1IlwfWl4JkVuGwg4E00GidZ9LOe';

  /* Supabase — used ONLY by the affiliate dashboard (/affiliate/) to read an
     affiliate's own clicks/sales via Row-Level-Security. The anon key is public
     and safe in the browser; the service_role key must NEVER live here (Worker
     only). Fill both in to switch the dashboard on. */
  var SUPABASE_URL = 'https://dwozxkyoqwioqggspztr.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3b3p4a3lvcXdpb3FnZ3NwenRyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNjQ2NTgsImV4cCI6MjA5OTY0MDY1OH0.ZbYPTMB-mOZyIcTQZAUraiDVfsANiQt5_33yQ5zdAI0';   // the "anon public" key from Supabase → Project settings → API

  /* =================================================================
     STOCK — everything is pre-order EXCEPT the SKUs listed here.
     Value `true` = the whole product ships now; an array = only those
     option labels ship now, every other size is pre-order.
     Keep the labels byte-identical to the `options[].label` values below.
  ================================================================= */
  var IN_STOCK = {
    'retatrutide': ['10 mg'],
    'ghk-cu': ['50 mg'],
    'ghk-cu-serum': true,
    'tirzepatide': ['20 mg'],
    'bacteriostatic-water': ['10 ml']
  };
  function isPreorder(slug, optionLabel) {
    if (isSoldOut(slug, optionLabel)) return false; // sold out ≠ pre-order
    var e = IN_STOCK[slug];
    if (e === true) return false;      // whole product in stock
    if (!e) return true;               // not listed → pre-order
    return e.indexOf(optionLabel) === -1;
  }

  /* SOLD OUT — cannot be bought at all (not orderable, unlike pre-order).
     `true` = whole product, array = those option labels only. */
  var SOLD_OUT = {
    'bacteriostatic-water': ['3 ml']
  };
  function isSoldOut(slug, optionLabel) {
    var e = SOLD_OUT[slug];
    if (!e) return false;
    if (e === true) return true;
    return e.indexOf(optionLabel) > -1;
  }
  /* inStock = ships in 24h: not pre-order and not sold out. This is the flag
     the cash-on-delivery (ramburs) rule checks. Manage it in the IN_STOCK map
     above (per product; `true` = all sizes, or list the buyable size labels). */
  function inStock(slug, optionLabel) {
    return !isPreorder(slug, optionLabel) && !isSoldOut(slug, optionLabel);
  }
  /* Three-state availability for the delivery-expectation UI, derived from the
     same IN_STOCK / SOLD_OUT maps (still the single source of truth — manage
     stock there). Returns 'in_stock' (ships in 2–3 business days),
     'backorder' (ordered in for the customer, 10–14 day delivery) or
     'sold_out' (cannot be bought). */
  function stockStatus(slug, optionLabel) {
    if (isSoldOut(slug, optionLabel)) return 'sold_out';
    if (isPreorder(slug, optionLabel)) return 'backorder';
    return 'in_stock';
  }

  function enc(path) { return path.split('/').map(encodeURIComponent).join('/'); }
  var IMG = '/Produktbilder/', COA = '/Janotest/';

  function P(o) {
    o.category = o.category || 'Peptides';
    o.purity = o.purity || '≥99%';
    o.form = o.form || 'Lyophilized powder';
    o.type = o.options ? 'variable' : 'simple';
    o.full = o.full || o.name;
    o.aliases = o.aliases || [];
    return o;
  }

  var products = [
    P({ slug: 'tirzepatide', name: 'GLP2-TZ', full: 'Tirzepatide (Mounjaro)', group: 'GLP-1', stock: 40,
        img: IMG + 'GLP2-TZ 5mg.png', aliases: ['tirzepatide', 'mounjaro', 'glp2', 'glp-2', 'tz', 'tirzep'],
        options: [ {label:'5 mg',price:60,ron:313.99}, {label:'10 mg',price:74.99,ron:392.99}, {label:'15 mg',price:119.99,ron:627.99}, {label:'20 mg',price:140,ron:732.99}, {label:'30 mg',price:155,ron:811.99}, {label:'60 mg',price:240,ron:1256.99} ],
        blurb: 'Dual GIP / GLP-1 receptor agonist studied in metabolic-signalling research. Supplied lyophilized for reconstitution.' }),
    P({ slug: 'semaglutide', name: 'GLP1-SM', full: 'Semaglutide (Ozempic/Wegovy)', group: 'GLP-1', stock: 34, onSale: true,
        img: IMG + 'GLP1-SM 5mg.png', aliases: ['semaglutide', 'ozempic', 'wegovy', 'glp1', 'glp-1', 'sm', 'sema'],
        options: [ {label:'5 mg',price:55,ron:287.99}, {label:'10 mg',price:75,ron:392.99}, {label:'15 mg',price:95,ron:496.99}, {label:'20 mg',price:115,ron:601.99} ],
        blurb: 'GLP-1 receptor agonist analog for metabolic-pathway research use only.' }),
    P({ slug: 'retatrutide', name: 'GLP-3 RT', full: 'Retatrutide', group: 'GLP-1', stock: 22, bestSeller: true,
        img: IMG + 'GLP-3 RT 5mg.png', aliases: ['retatrutide', 'glp3', 'glp-3', 'rt', 'reta'],
        options: [ {label:'5 mg',price:54.99,ron:287.99}, {label:'10 mg',price:79.99,ron:418.99}, {label:'15 mg',price:119.99,ron:627.99}, {label:'20 mg',price:129.99,ron:680.99} ],
        blurb: 'Triple agonist studied across GIP, GLP-1 and glucagon receptor activity.' }),
    P({ slug: 'cagrilintide', name: 'Cagrilintide', group: 'GLP-1', size: '10 mg', price: 119.99, ron: 627.99, stock: 18,
        img: IMG + 'Cagrilintide 10mg.png',
        blurb: 'Long-acting amylin analog investigated in appetite- and metabolic-regulation research.' }),

    P({ slug: 'hgh-somatropin', name: 'HGH — Somatropin', full: 'HGH 191aa Somatropin', group: 'Growth Hormone', stock: 26,
        img: IMG + 'HGH - Somatropin 15IU.png', coaImg: COA + 'HGH Somatropin .png', aliases: ['hgh', 'somatropin', '191aa', 'growth hormone'],
        options: [ {label:'15 IU',price:99.99,ron:523.99}, {label:'24 IU',price:149.99,ron:784.99} ],
        blurb: 'Recombinant somatropin supplied lyophilized for growth-hormone pathway research.' }),
    P({ slug: 'hcg', name: 'HCG', group: 'Growth Hormone', size: '5000 IU', price: 69.99, ron: 365.99, stock: 30,
        img: IMG + 'HCG 5000IU.png', coaImg: COA + 'HCG.png', aliases: ['hcg', 'gonadotropin'],
        blurb: 'Human chorionic gonadotropin for endocrine-signalling research use.' }),
    P({ slug: 'cjc-1295-no-dac', name: 'CJC-1295 (no DAC)', group: 'Growth Hormone', size: '10 mg', price: 64.99, ron: 339.99, stock: 44,
        img: IMG + 'CJC-1295 (no DAC) 10mg.png', aliases: ['cjc', 'cjc1295', 'cjc-1295'],
        blurb: 'GHRH analog without DAC, studied for short-acting secretagogue activity.' }),
    P({ slug: 'cjc-1295-with-dac', name: 'CJC-1295 (with DAC)', group: 'Growth Hormone', size: '10 mg', price: 149.99, ron: 784.99, stock: 21,
        img: IMG + 'CJC-1295 (with DAC) 10mg.png', aliases: ['cjc', 'cjc1295', 'cjc-1295', 'dac'],
        blurb: 'GHRH analog with drug-affinity complex for extended half-life research.' }),
    P({ slug: 'cjc-1295-ipamorelin', name: 'CJC-1295 (no DAC) + Ipamorelin', group: 'Growth Hormone', size: '5 / 5 mg', price: 74.99, ron: 392.99, stock: 33,
        form: 'Lyophilized blend', onSale: true, img: IMG + 'CJC-1295 (no DAC) + Ipamorelin 5mg-5mg.png', coaImg: COA + 'CJC-1295 (no DAC) + Ipamorelin.png', aliases: ['cjc', 'ipamorelin', 'cp10', 'blend'],
        blurb: 'Pre-combined secretagogue blend in a single vial for comparative studies.' }),
    P({ slug: 'ipamorelin', name: 'Ipamorelin', group: 'Growth Hormone', size: '10 mg', price: 74.99, ron: 392.99, stock: 52, onSale: true,
        img: IMG + 'Ipamorelin 10mg.png', aliases: ['ipamorelin', 'ipa'],
        blurb: 'Selective growth-hormone secretagogue with a clean receptor profile.' }),
    P({ slug: 'tesamorelin', name: 'Tesamorelin', group: 'Growth Hormone', size: '10 mg', price: 85, ron: 444.99, stock: 46, onSale: true,
        img: IMG + 'Tesamorelin 10mg.png', aliases: ['tesamorelin', 'tesa'],
        blurb: 'GHRH analog used to study growth-hormone releasing pathways.' }),
    P({ slug: 'sermorelin', name: 'Sermorelin', group: 'Growth Hormone', size: '10 mg', price: 129.99, ron: 680.99, stock: 24,
        img: IMG + 'Sermorelin 10mg.png', aliases: ['sermorelin'],
        blurb: 'GHRH (1–29) fragment studied for endogenous secretagogue signalling.' }),
    P({ slug: 'igf1-lr3', name: 'IGF1-LR3', group: 'Growth Hormone', size: '1 mg', price: 89.99, ron: 470.99, stock: 19,
        img: IMG + 'IGF1-LR3 1mg.png', aliases: ['igf', 'igf1', 'igf-1', 'lr3'],
        blurb: 'Long-arg-3 IGF-1 analog investigated in cellular growth research.' }),

    P({ slug: 'bpc-157', name: 'BPC-157', group: 'Recovery', size: '10 mg', price: 44.99, ron: 235.99, stock: 70, onSale: true,
        img: IMG + 'BPC-157 10mg.png', coaImg: COA + 'BPC-157.png', aliases: ['bpc', 'bpc157', 'bpc-157'],
        blurb: 'Stable gastric pentadecapeptide studied for tissue-repair signalling.' }),
    P({ slug: 'tb-500', name: 'TB-500', group: 'Recovery', size: '10 mg', price: 44.99, ron: 235.99, stock: 58,
        img: IMG + 'TB-500 10mg.png', aliases: ['tb', 'tb500', 'tb-500', 'thymosin beta'],
        blurb: 'Synthetic thymosin beta-4 fragment studied in actin regulation and motility.' }),
    P({ slug: 'bpc-157-tb-500', name: 'Wolverine Blend (BPC-157/TB-500)', group: 'Recovery', size: '5 / 5 mg', price: 79.99, ron: 418.99, stock: 36,
        form: 'Lyophilized blend', img: IMG + 'BPC-157 + TB-500 (Blend) 10mg.png', aliases: ['bpc', 'tb500', 'blend', 'wolverine'],
        blurb: 'Combined repair blend in one vial for comparative recovery research.' }),
    P({ slug: 'glow-blend', name: 'GLOW Blend (GHK-Cu + TB-500 + BPC-157)', group: 'Recovery', size: '50 mg', price: 99, ron: 517.99, stock: 27,
        form: 'Lyophilized blend', onSale: true, img: IMG + 'GLOW Blend (GHK-Cu + TB-500 + BPC-157) 50mg.png', aliases: ['glow', 'ghk', 'tb500', 'bpc'],
        blurb: 'Three-peptide blend combining GHK-Cu, TB-500 and BPC-157 for multi-target study.' }),
    P({ slug: 'ss-31', name: 'SS-31', full: 'SS-31 (Elamipretide)', group: 'Recovery', size: '10 mg', price: 55.99, ron: 292.99, stock: 31,
        img: IMG + 'SS-31 10mg.png', coaImg: COA + 'SS-31 (Elamipretide).png', aliases: ['ss-31', 'ss31', 'elamipretide', '2s10'],
        blurb: 'Mitochondria-targeted peptide investigated in cellular-stress research.' }),

    P({ slug: 'mots-c', name: 'MOTS-c', group: 'Longevity', size: '10 mg', price: 64.99, ron: 339.99, stock: 37,
        img: IMG + 'MOTS-c 10mg.png', aliases: ['mots', 'motsc', 'mots-c'],
        blurb: 'Mitochondrial-derived peptide studied in metabolic-homeostasis research.' }),
    P({ slug: 'thymosin-alpha-1', name: 'Thymosin Alpha-1', group: 'Longevity', size: '10 mg', price: 159.99, ron: 837.99, stock: 16,
        img: IMG + 'Thymosin Alpha-1 10mg.png', aliases: ['thymosin', 'alpha-1', 'ta1'],
        blurb: 'Immune-modulating peptide investigated in cellular defense research.' }),
    P({ slug: 'epitalon', name: 'Epitalon', full: 'Epithalon', group: 'Longevity', size: '10 mg', price: 64.99, ron: 339.99, stock: 33,
        img: IMG + 'Epitalon 10mg.png', aliases: ['epitalon', 'epithalon'],
        blurb: 'Tetrapeptide studied for telomerase and circadian-regulation research.' }),

    P({ slug: 'semax', name: 'Semax', group: 'Neuro', size: '10 mg', price: 39.99, ron: 208.99, stock: 48,
        img: IMG + 'Semax 10mg.png', coaImg: COA + 'Semax.png', aliases: ['semax', 'xa10'],
        blurb: 'Neuropeptide fragment investigated in cognitive- and neuro-protection research.' }),
    P({ slug: 'selank', name: 'Selank', group: 'Neuro', size: '10 mg', price: 39.99, ron: 208.99, stock: 45,
        img: IMG + 'Selank 10mg.png', aliases: ['selank'],
        blurb: 'Synthetic analog of tuftsin studied in anxiolytic and neuro-signalling research.' }),
    P({ slug: 'dsip', name: 'DSIP', group: 'Neuro', size: '10 mg', price: 59.99, ron: 313.99, stock: 29,
        img: IMG + 'DSIP 10mg.png', aliases: ['dsip', 'delta sleep'],
        blurb: 'Delta sleep-inducing peptide investigated in neuro-regulation research.' }),
    P({ slug: 'nad-plus', name: 'NAD+', group: 'Cellular', size: '500 mg', price: 74.99, ron: 392.99, stock: 41,
        img: IMG + 'NAD+ 500mg.png', coaImg: COA + 'NAD+.png', aliases: ['nad', 'nad+', 'nj500'],
        blurb: 'Nicotinamide adenine dinucleotide studied in cellular-energy research.' }),
    P({ slug: 'pt-141', name: 'PT-141 (Bremelanotide)', group: 'Neuro', size: '10 mg', price: 69.99, ron: 365.99, stock: 34,
        img: IMG + 'PT-141 (Bremelanotide) 10mg.png', aliases: ['pt-141', 'pt141', 'bremelanotide'],
        blurb: 'Melanocortin-agonist peptide investigated in neuro-behavioural research.' }),
    P({ slug: 'kpv', name: 'KPV', group: 'Recovery', size: '10 mg', price: 49.99, ron: 261.99, stock: 39,
        img: IMG + 'KPV 10mg.png', coaImg: COA + 'KPV.png', aliases: ['kpv', 'kpv10'],
        blurb: 'Alpha-MSH tripeptide fragment studied for anti-inflammatory signalling.' }),

    P({ slug: 'ghk-cu', name: 'GHK-Cu', group: 'Cosmetic', stock: 55, onSale: true, img: IMG + 'GHK-Cu 50mg.png',
        aliases: ['ghk', 'ghk-cu', 'ghkcu', 'copper peptide'],
        options: [ {label:'50 mg',price:44.99,ron:235.99}, {label:'100 mg',price:74.99,ron:392.99} ],
        blurb: 'Copper-binding tripeptide investigated in dermal and matrix-remodelling research.' }),
    P({ slug: 'mt-2', name: 'MT-2 (Melanotan 2)', group: 'Cosmetic', size: '10 mg', price: 34.99, ron: 182.99, stock: 47, onSale: true,
        img: IMG + 'MT-2 (Melanotan 2) 10mg.png', aliases: ['mt-2', 'mt2', 'melanotan'],
        blurb: 'Melanocortin analog studied in pigmentation-pathway research.' }),

    P({ slug: 'ghk-cu-serum', name: 'GHK-Cu Topical Serum', nameI18n: { de: 'GHK-CU Hautserum', ro: 'GHK-CU Ser Topical' },
        category: 'Topicals', group: 'Cosmetic', img: IMG + 'GHK-Cu Topical Serum 30ml.png',
        size: '30 ml', price: 49.99, ron: 261.99, oldPrice: 70, oldRon: 366.99, onSale: true,
        stock: 44, form: 'Topical solution', purity: 'GHK-Cu formulation',
        aliases: ['ghk', 'serum', 'topical', 'copper serum', 'hautserum', 'ser topical'],
        blurb: 'Ready-to-use GHK-Cu topical serum for dermal research applications. 30 ml pump bottle.' }),

    P({ slug: 'bacteriostatic-water', name: 'Bacteriostatic Water', nameI18n: { de: 'Bakteriostatisches Wasser', ro: 'Apă bacteriostatică' },
        category: 'Lab Supplies', group: 'Lab Supplies',
        img: IMG + 'Bacteriostatic Water 10mg.png', purity: '0.9% benzyl alcohol', form: 'Multi-dose vial', stock: 120,
        aliases: ['bacteriostatic', 'bac water', 'water', 'diluent', 'apa'],
        options: [ {label:'3 ml',price:4.99,ron:25.99}, {label:'10 ml',price:14.99,ron:77.99} ],
        blurb: 'Sterile diluent for reconstituting lyophilized research compounds.' })
  ];

  /* Janoshik verify links = the exact URL encoded in each report's QR code.
     Products tested at more than one size carry multiple entries so the
     COA page/lightbox can show every version. */
  var coaTests = {
    'bpc-157': [ { key: '134773_SXRU8P27IINC', img: 'BPC-157 10mg.png' } ],
    'bpc-157-tb-500': [ { key: '171862_FTCNR7UJ9HR2', img: 'BPC-157+TB-500 Blend (BPC-157 10mg + TB-500 10mg).jpg' } ],
    'cjc-1295-ipamorelin': [ { key: '134761_6LSBGXVE9K3I', img: 'CJC-1295 5mg + Ipamorelin 5mg.png' } ],
    'hcg': [ { key: '134737_M5J3ZWUXXICC', img: 'HCG 5000iu.png' } ],
    'hgh-somatropin': [
      { size: '24 IU', key: '134743_T1QYZRF3SVMR', img: 'HGH Somatropin 24iu.jpg' },
      { size: '36 IU', key: '196501_7P3BUC28NMDS', img: 'HGH Somatropin 36iu.jpg' }
    ],
    'kpv': [ { key: '134785_N5NVAXK9D3ZB', img: 'KPV 10mg.png' } ],
    'nad-plus': [ { key: '134767_7ZKAA2Y98UKQ', img: 'NAD+ 500mg.png' } ],
    'retatrutide': [
      { size: '20 mg', key: '172889_47I323J3CHI7', img: 'Retatrutide 20mg.jpg' },
      { size: '50 mg', key: '134797_NQ9N7A4WDXSR', img: 'Retatrutide 50mg.jpg' }
    ],
    'ss-31': [
      { size: '10 mg', key: '134779_STQDEYPSY362', img: 'SS-31 10mg.jpg' },
      { size: '50 mg', key: '170060_9UY94DQ5H5JT', img: 'SS-31 50mg.jpg' }
    ],
    'semaglutide': [ { key: '134803_3KE3LHFLV4RK', img: 'Semaglutide 20mg.png' } ],
    'semax': [ { key: '134755_TUN8DULLLKGC', img: 'Semax 10mg.png' } ],
    'tirzepatide': [
      { size: '20 mg', key: '172892_I6ZGAYMMFEFZ', img: 'Tirzepatide 20mg.jpg' },
      { size: '30 mg', key: '171860_M1ZLSLX8MHXD', img: 'Tirzepatide 30mg.jpg' },
      { size: '60 mg', key: '134791_V58DY41VZICX', img: 'Tirzepatide 60mg.jpg' }
    ]
  };
  function buildTests(tests) {
    return tests.map(function (tst) {
      return { size: tst.size || '', task: tst.key.split('_')[0], url: 'https://verify.janoshik.com/tests/' + tst.key, img: COA + tst.img };
    });
  }
  products.forEach(function (p) {
    var tests = coaTests[p.slug];
    if (!tests) return;
    var full = buildTests(tests);
    p.coaAll = full;
    p.coa = full[full.length - 1];
  });

  /* AHK-Cu is tested by Janoshik but not (yet) a catalog product — it still
     gets its own entry in the COA library. */
  var ahkTests = buildTests([{ size: '100 mg', key: '171867_RDW1G7KHKBQP', img: 'AHK-Cu 100mg.jpg' }]);
  var extraCoas = [
    { slug: 'ahk-cu', name: 'AHK-Cu', category: 'Peptides', order: 50, coaAll: ahkTests, coa: ahkTests[0] }
  ];

  /* per-size product photos so the product page can swap image on size change */
  var optBase = { 'tirzepatide': 'GLP2-TZ', 'semaglutide': 'GLP1-SM', 'retatrutide': 'GLP-3 RT', 'ghk-cu': 'GHK-Cu', 'hgh-somatropin': 'HGH - Somatropin' };
  products.forEach(function (p) {
    if (p.type !== 'variable' || !optBase[p.slug]) return;
    p.options.forEach(function (o) { o.img = IMG + optBase[p.slug] + ' ' + o.label.replace(/\s/g, '') + '.png'; });
  });
  (function () {
    var bw = products.filter(function (p) { return p.slug === 'bacteriostatic-water'; })[0];
    if (bw) { bw.options[0].img = IMG + 'Bacteriostatic Water 3ml.png'; bw.options[1].img = IMG + 'Bacteriostatic Water 10mg.png'; }
  })();

  /* lot numbers (used by the live bottom search + shown on cards) */
  products.forEach(function (p, i) {
    p.lot = 'TP' + p.slug.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase() + (2001 + i * 3);
  });

  /* apply 10% sale to on-sale products (both currencies);
     items with a hand-set oldPrice keep their explicit discount */
  function r2(n) { return Math.round(n * 100) / 100; }
  products.forEach(function (p) {
    if (!p.onSale) return;
    if (p.type === 'variable') p.options.forEach(function (o) { if (o.oldPrice) return; o.oldPrice = o.price; o.oldRon = o.ron; o.price = r2(o.price * 0.9); o.ron = r2(o.ron * 0.9); });
    else if (!p.oldPrice) { p.oldPrice = p.price; p.oldRon = p.ron; p.price = r2(p.price * 0.9); p.ron = r2(p.ron * 0.9); }
  });

  var shopOrder = ['retatrutide', 'tirzepatide', 'bacteriostatic-water', 'ghk-cu', 'ghk-cu-serum',
    'tesamorelin', 'glow-blend', 'cjc-1295-ipamorelin', 'mots-c', 'kpv', 'mt-2', 'semax', 'selank', 'semaglutide'];
  products.forEach(function (p) { var i = shopOrder.indexOf(p.slug); p.order = i === -1 ? 100 - (p.stock / 10) : i; });

  /* ---------- DE / RO translations for product data ---------- */
  var GROUP_I18N = {
    'GLP-1':          { de: 'GLP-1',                ro: 'GLP-1' },
    'Growth Hormone': { de: 'Wachstumshormon',      ro: 'Hormon de creștere' },
    'Recovery':       { de: 'Regeneration',         ro: 'Recuperare' },
    'Longevity':      { de: 'Langlebigkeit',        ro: 'Longevitate' },
    'Neuro':          { de: 'Neuro',                ro: 'Neuro' },
    'Cellular':       { de: 'Zellulär',             ro: 'Celular' },
    'Cosmetic':       { de: 'Kosmetik',             ro: 'Cosmetic' },
    'Lab Supplies':   { de: 'Laborbedarf',          ro: 'Consumabile de laborator' }
  };
  var FORM_I18N = {
    'Lyophilized powder': { de: 'Lyophilisiertes Pulver', ro: 'Pulbere liofilizată' },
    'Lyophilized blend':  { de: 'Lyophilisierte Mischung', ro: 'Amestec liofilizat' },
    'Topical solution':   { de: 'Topische Lösung',        ro: 'Soluție topică' },
    'Multi-dose vial':    { de: 'Mehrdosen-Vial',         ro: 'Flacon multidoză' }
  };
  var BLURB_I18N = {
    'tirzepatide': { de: 'Dualer GIP-/GLP-1-Rezeptoragonist, untersucht in der Erforschung metabolischer Signalwege. Lyophilisiert zur Rekonstitution geliefert.', ro: 'Agonist dublu al receptorilor GIP/GLP-1, studiat în cercetarea semnalizării metabolice. Livrat liofilizat pentru reconstituire.' },
    'semaglutide': { de: 'GLP-1-Rezeptoragonist-Analogon zur Erforschung metabolischer Signalwege. Nur für Forschungszwecke.', ro: 'Analog agonist al receptorului GLP-1 pentru cercetarea căilor metabolice. Doar pentru uz de cercetare.' },
    'retatrutide': { de: 'Dreifachagonist, untersucht hinsichtlich der Aktivität an GIP-, GLP-1- und Glukagon-Rezeptoren.', ro: 'Agonist triplu, studiat pentru activitatea la receptorii GIP, GLP-1 și glucagon.' },
    'cagrilintide': { de: 'Langwirksames Amylin-Analogon, untersucht in der Appetit- und Stoffwechselregulationsforschung.', ro: 'Analog de amilină cu acțiune prelungită, studiat în cercetarea reglării apetitului și a metabolismului.' },
    'hgh-somatropin': { de: 'Rekombinantes Somatropin, lyophilisiert geliefert für die Erforschung von Wachstumshormon-Signalwegen.', ro: 'Somatropină recombinantă, livrată liofilizat pentru cercetarea căilor hormonului de creștere.' },
    'hcg': { de: 'Humanes Choriongonadotropin für die Erforschung endokriner Signalwege.', ro: 'Gonadotropină corionică umană pentru cercetarea semnalizării endocrine.' },
    'cjc-1295-no-dac': { de: 'GHRH-Analogon ohne DAC, untersucht auf kurzwirksame Sekretagoga-Aktivität.', ro: 'Analog GHRH fără DAC, studiat pentru activitatea secretagogă de scurtă durată.' },
    'cjc-1295-with-dac': { de: 'GHRH-Analogon mit Drug-Affinity-Complex zur Erforschung einer verlängerten Halbwertszeit.', ro: 'Analog GHRH cu complex de afinitate (DAC) pentru cercetarea unei durate de înjumătățire prelungite.' },
    'cjc-1295-ipamorelin': { de: 'Vorgemischte Sekretagoga-Kombination in einem einzigen Vial für vergleichende Studien.', ro: 'Amestec secretagog precombinat într-un singur flacon, pentru studii comparative.' },
    'ipamorelin': { de: 'Selektives Wachstumshormon-Sekretagogum mit sauberem Rezeptorprofil.', ro: 'Secretagog selectiv al hormonului de creștere, cu un profil receptor curat.' },
    'tesamorelin': { de: 'GHRH-Analogon zur Untersuchung wachstumshormonfreisetzender Signalwege.', ro: 'Analog GHRH folosit pentru studierea căilor de eliberare a hormonului de creștere.' },
    'sermorelin': { de: 'GHRH-(1–29)-Fragment, untersucht auf endogene Sekretagoga-Signalgebung.', ro: 'Fragment GHRH (1–29), studiat pentru semnalizarea secretagogă endogenă.' },
    'igf1-lr3': { de: 'Long-Arg-3-IGF-1-Analogon, untersucht in der Zellwachstumsforschung.', ro: 'Analog IGF-1 Long-Arg-3, studiat în cercetarea creșterii celulare.' },
    'bpc-157': { de: 'Stabiles gastrisches Pentadecapeptid, untersucht auf Signalwege der Geweberegeneration.', ro: 'Pentadecapeptidă gastrică stabilă, studiată pentru semnalizarea de reparare a țesuturilor.' },
    'tb-500': { de: 'Synthetisches Thymosin-beta-4-Fragment, untersucht in der Aktin-Regulation und Zellmotilität.', ro: 'Fragment sintetic de timozină beta-4, studiat în reglarea actinei și motilitatea celulară.' },
    'bpc-157-tb-500': { de: 'Kombinierte Regenerations-Mischung in einem Vial für vergleichende Recovery-Forschung.', ro: 'Amestec combinat de recuperare într-un flacon, pentru cercetare comparativă a recuperării.' },
    'glow-blend': { de: 'Drei-Peptid-Mischung aus GHK-Cu, TB-500 und BPC-157 für Multi-Target-Studien.', ro: 'Amestec de trei peptide — GHK-Cu, TB-500 și BPC-157 — pentru studii multi-țintă.' },
    'ss-31': { de: 'Mitochondrien-gerichtetes Peptid, untersucht in der Erforschung zellulären Stresses.', ro: 'Peptidă direcționată spre mitocondrii, studiată în cercetarea stresului celular.' },
    'mots-c': { de: 'Mitochondrial abgeleitetes Peptid, untersucht in der Erforschung der metabolischen Homöostase.', ro: 'Peptidă derivată mitocondrial, studiată în cercetarea homeostaziei metabolice.' },
    'thymosin-alpha-1': { de: 'Immunmodulierendes Peptid, untersucht in der Erforschung der zellulären Abwehr.', ro: 'Peptidă imunomodulatoare, studiată în cercetarea apărării celulare.' },
    'epitalon': { de: 'Tetrapeptid, untersucht auf Telomerase- und Zirkadianregulationsforschung.', ro: 'Tetrapeptidă studiată pentru cercetarea telomerazei și a reglării circadiene.' },
    'semax': { de: 'Neuropeptid-Fragment, untersucht in der kognitiven und neuroprotektiven Forschung.', ro: 'Fragment neuropeptidic, studiat în cercetarea cognitivă și neuroprotectoare.' },
    'selank': { de: 'Synthetisches Tuftsin-Analogon, untersucht in der anxiolytischen und neuronalen Signalforschung.', ro: 'Analog sintetic al tuftsinei, studiat în cercetarea anxiolitică și a semnalizării neuronale.' },
    'dsip': { de: 'Delta-Schlaf-induzierendes Peptid, untersucht in der Neuroregulationsforschung.', ro: 'Peptidă care induce somnul delta, studiată în cercetarea neuroreglării.' },
    'nad-plus': { de: 'Nicotinamid-Adenin-Dinukleotid, untersucht in der Erforschung der zellulären Energie.', ro: 'Nicotinamidă adenin dinucleotidă, studiată în cercetarea energiei celulare.' },
    'pt-141': { de: 'Melanocortin-Agonist-Peptid, untersucht in der neuroverhaltensbezogenen Forschung.', ro: 'Peptidă agonistă melanocortinică, studiată în cercetarea neurocomportamentală.' },
    'kpv': { de: 'Alpha-MSH-Tripeptid-Fragment, untersucht auf entzündungshemmende Signalgebung.', ro: 'Fragment tripeptidic alfa-MSH, studiat pentru semnalizarea antiinflamatoare.' },
    'ghk-cu': { de: 'Kupferbindendes Tripeptid, untersucht in der dermalen und Matrix-Remodelling-Forschung.', ro: 'Tripeptidă care leagă cuprul, studiată în cercetarea dermică și a remodelării matricei.' },
    'mt-2': { de: 'Melanocortin-Analogon, untersucht in der Erforschung von Pigmentierungs-Signalwegen.', ro: 'Analog melanocortinic, studiat în cercetarea căilor de pigmentare.' },
    'ghk-cu-serum': { de: 'Gebrauchsfertiges GHK-Cu-Hautserum für dermale Forschungsanwendungen. 30-ml-Pumpflasche.', ro: 'Ser topic GHK-Cu gata de utilizare pentru aplicații de cercetare dermică. Flacon cu pompă de 30 ml.' },
    'bacteriostatic-water': { de: 'Steriles Lösungsmittel zur Rekonstitution lyophilisierter Forschungswirkstoffe.', ro: 'Diluant steril pentru reconstituirea compușilor de cercetare liofilizați.' }
  };
  products.forEach(function (p) {
    if (GROUP_I18N[p.group]) p.groupI18n = GROUP_I18N[p.group];
    if (FORM_I18N[p.form]) p.formI18n = FORM_I18N[p.form];
    if (BLURB_I18N[p.slug]) p.blurbI18n = BLURB_I18N[p.slug];
  });

  var strip = function (s) { return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
  var num = function (s) { return s.replace(/[^0-9.]/g, ''); };
  function val(x) { return CUR === 'ron' ? x.ron : x.price; }
  function fmt(n) { return CUR === 'ron' ? n.toFixed(2) + ' Lei' : n.toFixed(2) + '€'; }

  window.TOPPEP = {
    products: products,
    coas: products.filter(function (p) { return p.category !== 'Lab Supplies'; }).concat(extraCoas),
    categories: ['Peptides', 'Lab Supplies', 'Topicals'],
    featured: ['retatrutide', 'tirzepatide', 'ghk-cu', 'bpc-157', 'glow-blend', 'semaglutide'],
    currency: CUR,
    freeShip: CUR === 'ron' ? 1230 : 250,
    shipCost: CUR === 'ron' ? 35 : 15.90,
    bank: PAYMENT_BANK_DETAILS,
    orderInbox: ORDER_INBOX,
    orderApiUrl: ORDER_API_URL,
    stripePublishableKey: STRIPE_PUBLISHABLE_KEY,
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    isPreorder: isPreorder,
    isSoldOut: isSoldOut,
    inStock: inStock,
    stockStatus: stockStatus,
    /* unique payment reference: TOP- + 8 unambiguous chars (no 0/O/1/I) */
    genPaymentRef: function () {
      var alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ', out = '';
      var rnd = (window.crypto && window.crypto.getRandomValues)
        ? window.crypto.getRandomValues(new Uint32Array(8))
        : null;
      for (var i = 0; i < 8; i++) {
        var r = rnd ? rnd[i] : Math.floor(Math.random() * 4294967296);
        out += alphabet[r % alphabet.length];
      }
      return 'TOP-' + out;
    },
    janoshikBlur: '/janoshikblur.png',
    strip: strip,
    imgUrl: function (path) { return enc(path); },
    bySlug: function (slug) { return products.filter(function (p) { return p.slug === slug; })[0]; },
    bacWater10: function () { var w = window.TOPPEP.bySlug('bacteriostatic-water'); return { product: w, option: w.options[1] }; },
    valOf: val,
    priceOf: function (p) {
      if (p.type === 'variable') return Math.min.apply(null, p.options.map(val));
      return val(p);
    },
    priceLabel: function (p) {
      if (p.type === 'variable') {
        // never advertise a price the customer can't actually buy
        var buyable = p.options.filter(function (o) { return !isSoldOut(p.slug, o.label); });
        var vs = (buyable.length ? buyable : p.options).map(val);
        var lo = Math.min.apply(null, vs), hi = Math.max.apply(null, vs);
        return lo === hi ? fmt(lo) : fmt(lo) + ' – ' + fmt(hi);
      }
      return fmt(val(p));
    },
    sizeLabel: function (p) {
      if (p.type === 'variable') {
        var labs = p.options.map(function (o) { return o.label; });
        var unit = labs[0].replace(/[0-9.,\/\s]/g, '');
        return num(labs[0]) + '–' + num(labs[labs.length - 1]) + ' ' + unit;
      }
      return p.size;
    },
    money: fmt
  };
})();
