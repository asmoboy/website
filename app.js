/* ===================================================================
   TOP PEP — application shell
   Builds global chrome (ticker, header, search modal, cart drawer,
   footer), owns cart state (localStorage), and runs per-page logic.
=================================================================== */
(function () {
  'use strict';
  var T = window.TOPPEP;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var money = T.money;
  var CUR = T.currency;
  function lv(x) { return CUR === 'ron' ? x.ron : x.price; }
  function lvOld(x) { return CUR === 'ron' ? x.oldRon : x.oldPrice; }
  function esc(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); }
  function pimg(p) { return '<img src="' + T.imgUrl(p.img) + '" alt="' + esc(p.name) + '" loading="lazy">'; }
  function pimgLine(i) { var im = i.img || (T.bySlug(i.slug) || {}).img || ''; return '<img src="' + T.imgUrl(im) + '" alt="" loading="lazy">'; }
  function displayName(p) { return (p.nameI18n && p.nameI18n[lang]) || p.name; }
  function lineName(i) { var p = T.bySlug(i.slug); return p ? displayName(p) : i.name; }
  function blurbText(p) { return (p.blurbI18n && p.blurbI18n[lang]) || p.blurb; }
  function formLabel(p) { return (p.formI18n && p.formI18n[lang]) || p.form; }
  function groupLabel(p) { return (p.groupI18n && p.groupI18n[lang]) || p.group; }

  /* ---- inline icons ---- */
  var I = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6"/></svg>',
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 7h14l-1.4 9.2a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8L5 4H2"/><circle cx="9" cy="21" r="1.3"/><circle cx="18" cy="21" r="1.3"/></svg>',
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><line x1="3" y1="7" x2="21" y2="7"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="17" x2="21" y2="17"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><line x1="4" y1="12" x2="19" y2="12"/><path d="M13 6l6 6-6 6"/></svg>',
    flask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 8l9-5 9 5v8l-9 5-9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
    truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="1" y="6" width="14" height="11"/><path d="M15 9h4l3 3v5h-7z"/><circle cx="6" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
    doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v4h4M9 13h6M9 17h4"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="4" y="10" width="16" height="11" rx="1"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><line x1="4" y1="8" x2="20" y2="8"/><line x1="4" y1="16" x2="20" y2="16"/><circle cx="9" cy="8" r="2.2" fill="currentColor"/><circle cx="15" cy="16" r="2.2" fill="currentColor"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12l5 5L20 6"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9s1.3-6.5 3.8-9z"/></svg>',
    google: '<svg viewBox="0 0 24 24"><path fill="#0B0B0D" d="M12 11v3.3h4.6c-.2 1.2-1.5 3.5-4.6 3.5-2.8 0-5-2.3-5-5.1s2.2-5.1 5-5.1c1.6 0 2.6.7 3.2 1.2l2.2-2.1C16 4.5 14.2 3.7 12 3.7 7.5 3.7 3.9 7.3 3.9 12s3.6 8.3 8.1 8.3c4.7 0 7.8-3.3 7.8-7.9 0-.5 0-.9-.1-1.4z"/></svg>'
  };

  /* =================================================================
     i18n — EN / DE / RO. Persisted; translates chrome + JS-rendered UI.
  ================================================================= */
  var DICT = {
    en: {
      nav_shop: 'Catalog', nav_coa: 'COA', nav_quality: 'Quality', nav_shipping: 'Shipping', nav_wholesale: 'Wholesale', nav_partner: 'Partner Program',
      sign_in: 'Sign in', about: 'About', faq: 'FAQ',
      add_to_cart: 'Add to cart', select_options: 'Select options', tap_a_size: 'Tap a size to add to cart',
      sale: 'Sale', best_seller: 'Best seller', on_sale: 'On sale', clear: 'Clear', checkout: 'Checkout',
      cat_peptides: 'Peptides', cat_capsules: 'Capsules', cat_labsupplies: 'Lab Supplies', cat_topicals: 'Topicals',
      your_cart: 'Your cart', cart_empty: 'Your cart is empty', subtotal: 'Subtotal', browse: 'Browse the catalog',
      free_ship_unlocked: 'You’ve unlocked <b>free shipping</b>', away_free: 'away from <b>free shipping</b>',
      added_recon: 'Added for reconstitution', ships_taxes: 'Shipping &amp; taxes calculated at checkout.',
      in_stock_today: 'In stock · ships today', ships_next: 'In stock · ships next business day',
      two_day: '2-day delivery — get it by', select_size: 'Select size', purity: 'Purity', form: 'Form', dispatch: 'Dispatch',
      same_day: 'Same-day', same_day_dispatch: 'Same-day dispatch', third_party: 'Third-party tested', coa_per_lot: 'COA per lot', free_over: 'Free shipping over €250',
      categories: 'Categories', continue_shopping: 'Continue shopping', search_ph: 'Search compounds…',
      popular: 'Popular items', no_results: 'No compounds match', results: 'results',
      coa_verified: 'Verified', coa_in_testing: 'In testing', coa_report_soon: 'awaiting Janoshik — report coming soon',
      coa_verified_count: 'lots verified', coa_coming_soon: 'Coming Soon', coa_open_janoshik: 'Open on Janoshik official site', promo_code: 'Promo code', promo_enter: 'Enter code', apply: 'Apply', search_lot_ph: 'Search by compound',
      remove: 'Remove', qty: 'Qty', research_only: 'Research use only', free_shipping_over: 'Free shipping over',
      place_order: 'Place order', order_placed: 'Order placed ✓', secured_demo: 'You’ll get our bank details and a unique payment reference on the next step. No card details are stored.',
      order_summary: 'Order summary', shipping_word: 'Shipping', total: 'Total', free_word: 'Free',
      join: 'Join', nl_title: 'Lab updates, not noise.', nl_sub: 'New lots and COA releases once or twice a month. No spam, unsubscribe anytime.', nl_done: 'Subscribed — check your inbox to confirm.',
      footer_desc: 'Research peptides sourced from accredited manufacturers, independently verified, and shipped discreetly.',
      f_catalog: 'Catalog', f_company: 'Company', f_support: 'Support', fl_all: 'All products', fl_coa: 'COA library',
      disclaimer: 'All products are sold strictly for laboratory and in-vitro research use only. Nothing offered on this site is a drug, food, cosmetic, or medical device, and none of it is intended for human or veterinary use, consumption, or administration. By ordering you confirm you are a qualified researcher.',
      rights: 'For research use only.', reset: 'Reset', back_catalog: '← Back to catalog', description: 'Description', details: 'Details', specifications: 'Specifications', coa_in_box: 'Free lot-matched COA in every box', results_for: 'results for', product: 'Product', price: 'Price', proceed_checkout: 'Proceed to checkout', contact_label: 'Contact', shipping_method: 'Shipping method', payment: 'Payment', cart_empty_sub: 'Browse the catalog to add third-party tested research compounds — a lot-matched COA ships with every order.',
      all: 'All', the_catalog: 'The catalog', all_research: 'All research compounds', shop_empty: 'Nothing in this category yet — new stock is added regularly.',
      hero_eyebrow: 'Third-party tested · Research use only', hero_h1: 'Every vial ships with <span class="outline">proof</span>, not promises.',
      hero_lede: 'TOP Pep sources and tests our research peptides through independent lab analysis. A Certificate of Analysis for tested batches is published on the product page — real results, not just claims.',
      next_business_day: 'Next business day', next_day_dispatch: 'Dispatch on the next business day',
      ag_eyebrow: 'Research use only', ag_h: 'You must be 18 or older to enter',
      ag_p: 'TOP Pep supplies research compounds strictly for in-vitro laboratory use — not intended for human or veterinary consumption. By continuing, you confirm you are at least 18 years old and agree to our <a href="/terms/">Terms &amp; Conditions</a> and <a href="/legal-agreement/">Research Use Agreement</a>.',
      ag_enter: 'I\'m 18 or older — Enter', ag_exit: 'Exit', ag_foot: 'HPLC + MS tested · COA available · Discreet shipping',
      bac_water: 'Bacteriostatic Water 10 ml',
      hero_cta1: 'Browse the catalog', hero_cta2: 'View the COA library', stat_purity: 'Documented purity', stat_compounds: 'Compounds in stock', stat_free: 'Free-shipping threshold',
      sec_best: 'The catalog', sec_featured: 'Peptides', shop_all: 'Shop all', browse_word: 'Browse',
      sec_glp_eyebrow: 'GLP-1 &amp; metabolic', sec_glp_h: 'Metabolic research', sec_gh_eyebrow: 'Secretagogues', sec_gh_h: 'Growth-hormone peptides', sec_rec_eyebrow: 'Repair', sec_rec_h: 'Recovery &amp; healing',
      promise1_h: 'Tested before it lists', promise1_p: 'Every lot is third-party verified for identity and purity <em>before</em> it goes on sale — never after a complaint.',
      promise2_h: 'COA in every box', promise2_p: 'The certificate matched to your exact lot number ships with the order and stays public in our library.',
      promise3_h: 'Discreet &amp; tracked', promise3_p: 'Plain, unbranded packaging with tracking, dispatched within 24–48 hours and delivered across the EU and UK.',
      faqt_eyebrow: 'Questions', faqt_h: 'Before you order', faqt_p: 'Purity, packaging, storage, and what “research use only” actually means — the short version.', faqt_all: 'All FAQs',
      faqt_q1: 'Is a Certificate of Analysis included?', faqt_a1: 'Yes. Every lot is third-party tested and the lot-matched COA ships in the box and is posted publicly so you can verify it against your vial.',
      faqt_q2: 'How is my order packaged?', faqt_a2: 'Discreetly, with no product references on the outside, and dispatched within 24–48 hours with tracking.',
      faqt_q3: 'How should lyophilized peptides be stored?', faqt_a3: 'Sealed vials are stable at –20 °C away from light. Once reconstituted, keep refrigerated and use within your protocol’s window.',
      ship_protect: 'Shipping protection', ship_protect_sub: 'Covers loss, damage or a stuck parcel — we reship free of charge',
      form_invalid: 'Please complete the required fields with a valid email.', form_sending: 'Sending…',
      form_ok_wholesale: 'Thanks — your request is in. We review accounts manually and reply within 1–2 business days.',
      form_ok_partner: 'Thanks — your application is in. We review partners manually and reply within 1–2 business days.',
      form_ok_contact: 'Thanks — your message is on its way. We usually reply within a few hours on business days.',
      nav_contact: 'Contact',
      ct_h1: 'Contact us', ct_lede: 'Question about an order, a COA, or reconstitution? Send us a message — we usually reply within a few hours on business days.',
      ct_order: 'Order number (optional)', ct_msg: 'Your message', ct_send: 'Send message', ct_name: 'Name',
      ph_first: 'First name', ph_last: 'Last name', ph_email: 'Email', ph_company: 'Company (optional)', ph_phone: 'Phone',
      wh_eb1: 'Wholesale &amp; volume', wh_h1: 'Ordering<br>in volume?',
      wh_p1: 'Clinics, resellers, and research groups get standing accounts with fixed volume pricing, full COA documentation on every batch, and dispatch priority ahead of retail orders. Send us your monthly volume and we’ll put together a program.',
      wh_s1: 'Units per order', wh_s2: 'Approved accounts', wh_s3: 'Average dispatch', wh_cta: 'Request wholesale pricing',
      wh_eb2: 'How it works', wh_h2: 'Scaled to what you order',
      wh_c1: '<b>Tiered pricing</b> starting at 15 units', wh_c2: '<b>Direct contact person</b> for order handling', wh_c3: '<b>Batch-level COAs</b> included per shipment', wh_c4: '<b>Flexible payment terms</b> for verified partners', wh_c5: '<b>Recurring supply slots</b> for regular buyers',
      wh_feb: 'Get in touch', wh_fh: 'Set up your account', wh_fp: 'Share your product interest, expected monthly volume, and order frequency — accounts are reviewed manually before pricing is released.',
      wh_ph_msg: 'Products of interest, estimated volume, order frequency', wh_send: 'Send request',
      q_eb: 'Quality &amp; testing', q_h1: 'Verified before it lists, not after a complaint.',
      q_p1: 'Every batch is independently assayed by Janoshik before it reaches the catalog — and the original certificate is published so you can check it yourself.',
      q_s1: 'HPLC purity', q_s2: 'Core methods', q_s3: 'Independent lab',
      q_meb: 'The methods', q_mh: 'Seven checks on every batch — tested by Janoshik',
      q_m1h: 'Reverse-Phase HPLC', q_m1p: 'Purity quantified against reference standards — Janoshik’s core test, and the headline number on every certificate.',
      q_m2h: 'Mass Spectrometry (LC-MS)', q_m2p: 'Molecular identity confirmed by mass-to-charge analysis — the compound is what the label claims, not a substitute.',
      q_m3h: 'TFA Content', q_m3p: 'Residual trifluoroacetic acid measured — relevant for peptide synthesis byproducts that HPLC purity alone won’t flag.',
      q_m4h: 'Endotoxin (LAL)', q_m4p: 'Bacterial endotoxin levels screened against a defined threshold.',
      q_m5h: 'Sterility', q_m5p: 'Checked separately from purity — a chemically pure batch can still carry bacterial contamination, so it’s tested independently.',
      q_m6h: 'Heavy Metals', q_m6p: 'Trace elemental contaminants screened on request for batches where it matters.',
      q_m7h: 'Batch-Level Archival', q_m7p: 'Each batch carries a unique Lot ID linked to its Janoshik COA — verifiable directly on janoshik.com, exact paperwork for the exact vial.',
      q_peb: 'The process', q_ph: 'From synthesis to your bench',
      q_p1h: 'Synthesized to spec', q_p1p: 'Produced to a defined specification and lyophilized to a shelf-stable powder — sealed against light and moisture.',
      q_p2h: 'Independently assayed by Janoshik', q_p2p: 'All our peptides are sample-tested by Janoshik Analytical for HPLC purity and MS identity. We don’t grade our own work.',
      q_p3h: 'Certificate published', q_p3p: 'The COA is available directly on the product page — the original test results from Janoshik.',
      q_p4h: 'Sealed &amp; dispatched', q_p4p: 'Vials from tested batches are sealed and shipped discreetly.',
      q_ceb: 'On the certificate', q_ch: 'Proof, not promises',
      q_cp: 'A certificate only counts if it holds up to scrutiny. Every TOP Pep COA links back to a batch you can check yourself — nothing here is just taken at our word.',
      q_cc1: 'HPLC purity, benchmarked against reference standards', q_cc2: 'Identity confirmed via mass spectrometry &amp; molecular weight', q_cc3: 'Tested independently by Janoshik — we don’t mark our own homework',
      q_cbtn: 'Open the COA lookup &rarr;',
      sp_eb: 'Discreet &amp; reliable shipping', sp_h: 'Packed tight,<br>delivered quiet.',
      sp_p: 'Every order is handled with the same care as the compound itself — sealed, packed to survive transit, and sent out without any branding that gives away what’s inside.',
      sp_s2: 'Ships free', sp_s3v: 'Plain', sp_s3: 'Unmarked packaging',
      sp_beb: 'Built to arrive intact', sp_bh: 'Freeze-dried &amp; shelf-stable',
      sp_b1h: 'No refrigeration needed', sp_b1p: 'Compounds are lyophilized into a stable powder and protected from light and moisture — no cold chain, no rush shipping.',
      sp_b2h: 'Sealed for your protection', sp_b2p: 'Vials ship sealed, so you can tell right away if anything was tampered with in transit.',
      sp_b3h: 'Lab results for every batch', sp_b3p: 'The COA behind your product is published on the site — the real test result, not a generic spec sheet.',
      sp_teb: 'Sealed &amp; tracked', sp_th: 'Packed and on its way',
      sp_tp: 'Every order is packed and passed to the carrier within 1 business day — plain outer packaging, no branding, with tracking sent out the moment it ships.',
      sp_t1: 'Orders over €250 ship free', sp_t2: 'Tracking included, sent as soon as your order is dispatched', sp_t3: 'Discreet packaging, nothing on the outside gives it away', sp_t4: 'Delivery across the EU',
      sp_faq: 'Read the FAQ', sp_contact: 'Contact us',
      pt_eb: 'Partner program', pt_h1: 'Partner with <span class="accent">premium</span> research peptides',
      pt_lede: 'Earn 20%–40% commission on every research-peptide order you refer. The more you sell, the more you earn — with transparent tracking and reliable monthly payouts.',
      pt_cta: 'Become a Partner &rarr;',
      pt_s1: 'Tiered commission', pt_s2v: '5 tiers', pt_s2: 'Performance levels', pt_s3v: '30 days', pt_s3: 'Cookie window', pt_s4v: 'Monthly', pt_s4: 'Payouts via PayPal',
      pt_earn_h: 'Example monthly earnings', pt_earn_r1: 'Up to 10.000&euro; revenue &middot; 20%', pt_earn_r2: 'Recurring orders',
      pt_why_pill: 'Why TOP Pep', pt_why_h: 'Research peptide <span class="accent">partnership</span>', pt_why_sub: 'Industry-leading commission rates for premium, third-party tested research peptides.',
      pt_sr1: '<b>Tiered</b>Commission rates', pt_sr2: '<b>Levels</b>Performance tiers', pt_sr3: '<b>PayPal</b>Payouts', pt_sr4: '<b>Active</b>Partners',
      pt_f1h: 'Premium research peptides', pt_f1p: '&gt;99% pure research-grade peptides with consistent, documented quality.',
      pt_f2h: 'Simple process', pt_f2p: 'Get started in minutes with your unique affiliate code — no approval delays.',
      pt_f3h: 'Real-time tracking', pt_f3p: 'Monitor clicks, conversions, and commissions instantly from your dashboard.',
      pt_gs_pill: 'Get started', pt_gs_h: 'How it <span class="accent">works</span>', pt_gs_sub: 'Start earning in minutes with our simple affiliate process.',
      pt_st1h: 'Sign up', pt_st1p: 'Create your account and get your unique affiliate code instantly.',
      pt_st2h: 'Share', pt_st2p: 'Promote TOP Pep to your audience with your referral link.',
      pt_st3h: 'Earn', pt_st3p: 'Start at 20% commission and climb to 40% as your sales volume grows.',
      pt_st4h: 'Get paid', pt_st4p: 'Receive monthly payouts via PayPal with no minimum threshold.',
      pt_ex_h: 'Commission tiers &amp; example earnings',
      pt_ex_r2: 'From 10.000&euro; revenue &middot; 25%', pt_ex_r3: 'From 25.000&euro; revenue &middot; 30%', pt_ex_r4: 'From 50.000&euro; revenue &middot; 35%', pt_ex_r5: 'From 100.000&euro; revenue &middot; 40%',
      pt_ex_note: 'Commission rate scales with your monthly referred revenue.',
      pt_su_eb: 'Become a partner', pt_su_h: 'Apply to the program', pt_su_p: 'Tell us where you’ll promote and your audience size — most applications are reviewed within 1–2 business days.',
      pt_ph_channel: 'Website, social handle or channel', pt_ph_msg: 'Audience size, niche, and how you plan to promote', pt_apply: 'Apply now',
      fq_sub: 'Answers on testing, storage, shipping and support.', fq_seb: 'Support', fq_sh: 'Talk to a human',
      fq_q1: 'Are the products tested?', fq_a1: 'Yes — batches are tested for purity via HPLC and identity via mass spectrometry through Janoshik Analytical, an independent lab. Results are published so you can verify them yourself.',
      fq_q2: 'Where can I find a Certificate of Analysis (COA)?', fq_a2: 'COAs are listed right on the product page for tested batches, and also saved in your account once you\'ve ordered.',
      fq_q3: 'What\'s the best way to store these compounds?', fq_a3: 'They arrive freeze-dried and shielded from light, so no refrigeration is needed during shipping. For longer-term storage, keep them at –20°C away from light — check the product page for specifics on your item.',
      fq_q4: 'How quickly do orders go out?', fq_a4: 'Items in stock are packed and shipped the same or next business day, and you\'ll get tracking as soon as it\'s dispatched. Need it faster? Expedited shipping is available at checkout.',
      fq_q5: 'Is my order shipped discreetly?', fq_a5: 'Yes. Everything goes out in plain, unbranded, tamper-evident packaging — nothing on the box hints at what\'s inside.',
      fq_q6: 'Do you have wholesale or bulk pricing?', fq_a6: 'We do, for labs, clinics, and resellers — think volume discounts, batch COAs, and payment terms for accounts that qualify. Get in touch with us to set it up.',
      fq_q7: 'Are these products meant for human or animal use?', fq_a7: 'No — strictly for in-vitro laboratory research. Not a drug, food, or cosmetic product. You\'ll need to confirm you\'re purchasing as a qualified researcher.',
      fq_q8: 'What\'s your return policy?', fq_a8: 'Since these are research chemicals, once an order ships, the sale is final. If something arrives damaged or wrong, let us know within 7 days and we\'ll sort it out.',
      fq_sq1: 'How fast can I expect a reply?', fq_sa1: 'Our support team usually gets back to you within minutes during business hours. If it\'s urgent — an order issue that needs immediate attention — just start your message with "URGENT."',
      fq_sq2: 'How do I track my order?', fq_sa2: 'Send us your order number in chat and we\'ll pull up the tracking for you. You\'ll also get an automatic email notification once your order ships.',
      fq_sq3: 'My order arrived damaged, or it\'s the wrong item — what now?', fq_sa3: 'Reach out right away with your order number and a photo of the issue. We\'ll sort out a replacement or refund as fast as we can.',
      fq_sq4: 'Can you help with reconstitution?', fq_sa4: 'Yes — our team can walk you through reconstitution for any peptide in our catalog. Just let us know which one in chat.',
      fq_sq5: 'Can you help me pick products for my research?', fq_sa5: 'Sure, tell us what you\'re working on and we\'ll point you to the peptides that fit.',
      fq_sq6: 'How do I get the Certificate of Analysis (COA) for my order?', fq_sa6: 'Send us your order number or the product name in chat, and we\'ll send over the COA for tested batches.',
      fq_sq7: 'My payment didn\'t go through — what should I do?', fq_sa7: 'Usually switching to a different card or payment method fixes it. Still stuck? Message us and we\'ll help figure out what\'s going on.',
      ab_eb: 'About', ab_h1: 'Documentation is the product.',
      ab_p1: 'TOP Pep started from a simple frustration: research material sold on trust alone, with no paper to back it. We fixed the paper first, then built the catalog around it.',
      ab_s1: 'Founded', ab_s2: 'Source per compound', ab_s3: 'Lots documented',
      ab_e1: 'The standard', ab_h2a: 'Proof before promises',
      ab_p2: 'Anyone can call a vial “high purity.” We publish the number, tie it to your lot, and let the certificate do the talking. If a lot doesn’t pass, it doesn’t ship — there’s no version of the story where marketing outruns the data.',
      ab_l1: 'How we test', ab_e2: 'Who it’s for', ab_h2b: 'Made for people who read the COA',
      ab_p3: 'Our customers are labs, students, and independent researchers who care what’s actually in the vial. We build for the person who checks the lot number — because that person is right to.',
      ab_l2: 'Browse the COA library',
      co_h1: 'Checkout', co_email: 'Email address', co_news: 'Email me new lot &amp; COA releases', ship_addr: 'Shipping address',
      co_inst: 'Institution / lab (optional)', co_addr: 'Street', co_city: 'City', co_zip: 'Postal code', co_country: 'Country',
      co_ship1: 'Tracked standard', co_ship1s: 'All EU countries, 24–48h dispatch', co_ship1p: 'Free over €250',
      co_ship2: 'Express', co_ship2s: 'Priority, insulated, 1–2 days', co_ship3: 'United Kingdom', co_ship3s: 'Tracked, 3–5 days',
      co_addons: 'Add to your order', co_add: 'Add', co_card: 'Card',
      coa_subtitle: 'Janoshik Test Results', coa_page_h1: 'COAs',
      sort_recommended: 'Recommended', sort_az: 'A → Z', sort_price_asc: 'Price ↑', sort_price_desc: 'Price ↓',
      acc_welcome: 'Welcome back', acc_create_title: 'Create your account', acc_signin: 'Sign in', acc_create: 'Create account',
      acc_google: 'Continue with Google', acc_or_email: 'or with email', acc_name: 'Full name', acc_pass: 'Password',
      acc_remember: 'Remember me', acc_forgot: 'Forgot password?', acc_demo: 'Demo only — no account was created.',
      pay_bank: 'Bank transfer', pay_bank_body: 'Transfer details are emailed after you place the order; we dispatch on receipt of cleared funds.',
      pay_crypto: 'Crypto', pay_crypto_body: 'Pay in BTC, ETH or USDT. A wallet address and the exact amount are shown after you place the order.',
      cc_num: 'Card number', cc_exp: 'Expiry', cc_cvc: 'CVC', co_added: 'Added',
      pay_confirm_title: 'Complete your bank transfer', pay_confirm_intro: 'Your order is reserved. Transfer the total below and add the payment reference so we can match it to your order — we dispatch as soon as the money arrives.',
      pay_amount: 'Amount', pay_reference: 'Payment reference', pay_account: 'Account name', pay_iban: 'IBAN', pay_bic: 'BIC / SWIFT', pay_bankname: 'Bank',
      pay_copy: 'Copy', pay_copied: 'Copied ✓', pay_ref_hint: 'Add this exact reference as the payment description so we can find your transfer.',
      pay_order_no: 'Order number', pay_status_pending: 'Awaiting payment', pay_note_keep: 'Note your payment reference — you’ll need it for the transfer. We’ll email you as soon as the payment is confirmed.',
      pay_back_home: 'Back to home', pay_view_faq: 'Payment questions? Read the FAQ', place_order_bt: 'Place order &amp; get bank details',
      place_order_card: 'Pay by card', pay_redirecting: 'Redirecting to secure payment…', pay_processing: 'Processing your payment…',
      co_phone: 'Phone (optional)', co_house: 'House no.', accepted_cards: 'Accepted cards',
      sold_out: 'Sold out', sold_out_note: 'This size is sold out at the moment.',
      ship_24h: 'Ships in 24h',
      lowstock_note: 'Some items in your order are low in stock. They may need to be reordered — if so, shipping takes 7–9 working days.',
      err_zip: 'That postal code doesn’t match the selected country. Please check it.',
      err_zip_fmt: 'Postal code for {country} must be {n} digits.',
      warn_zip_city: 'Postal code {zip} belongs to {city} — please check.',
      warn_zip_unknown: 'Postal code {zip} was not found — please check.',
      zip_use_anyway: 'Use address anyway',
      zip_checking: 'Checking address…',
      err_house_req: 'Please enter a house number.',
      err_house: 'Please include a house number (e.g. 12, 12a).',
      err_phone: 'Please enter a valid phone number, or leave the field empty.',
      pay_card_error: 'Sorry, we couldn’t start the card payment. Please try again or use bank transfer.',
      pay_paid_title: 'Payment received', pay_paid_intro: 'Thank you — your card payment went through. We’re preparing your parcel now and it ships within 1 business day; you’ll get a tracking link by email.',
      pay_cancel_note: 'Payment cancelled — nothing was charged. You can try again or choose bank transfer.',
      pay_choose: 'Payment method', pay_card_label: 'Card', pay_card_sub: 'Pay securely by card now.',
      pay_cod: 'Cash on delivery', pay_cod_sub: 'Pay in cash to the courier when your parcel arrives.',
      pay_cod_hint: 'Cash on delivery is only available for orders where every item ships within 24 hours.',
      place_order_cod: 'Place order — pay on delivery',
      cod_confirm_title: 'Order placed — pay on delivery', cod_confirm_intro: 'Thank you! Your order is confirmed. Please have the amount below ready in cash to pay the courier when your parcel arrives.',
      cod_amount_due: 'Amount to pay on delivery', cod_status: 'Cash on delivery',
      tab_coa_tested: 'This lot is third-party tested by Janoshik (task #{task}). <a href="{url}" target="_blank" rel="noopener" style="color:#fff;text-decoration:underline;">View the verified report</a>.',
      tab_coa_testing: 'This compound is currently in testing at Janoshik — the verified report will be published in our COA library as soon as it lands.',
      tab_details_body: 'Supplied as a sealed {form} in a tamper-evident vial. Reconstitute with bacteriostatic water according to your own protocol; we provide no dosing guidance, as all products are sold strictly for laboratory research use.',
      spec_storage: 'Storage', spec_storage_val: '–20 °C, protect from light', spec_use: 'Use', spec_use_val: 'Research only', spec_coa_testing: 'In testing',
      legal_updated: 'Last updated · 2026-07-01', legal_operated: 'TOP Pep is operated by ORCA MARKETING AGENCY S.R.L.',
      tc_h1: 'Terms &amp; conditions',
      tc_s1h: 'Research use only', tc_s1p: 'All products are sold strictly for in-vitro laboratory and analytical research. Nothing offered is a drug, food, cosmetic, or medical device, and none of it is intended for human or veterinary use, consumption, or administration. By ordering you confirm you are a qualified researcher and will handle material accordingly.',
      tc_s2h: 'Eligibility', tc_s2p: 'You must be of legal age in your jurisdiction and permitted to purchase research chemicals where you are located. You are responsible for ensuring that receipt and use of any compound is lawful in your country.',
      tc_s3h: 'Orders &amp; pricing', tc_s3p: 'Prices are shown in euro and may change without notice. We may decline or cancel any order at our discretion, including where a lot fails verification or where we cannot ship lawfully to your address.',
      tc_s4h: 'Liability', tc_s4p: 'To the fullest extent permitted by law, TOP Pep — a brand operated by ORCA MARKETING AGENCY S.R.L. — is not liable for any use of products beyond their stated research purpose. You assume all responsibility for safe handling, storage, and disposal.',
      tc_s5h: 'Changes', tc_s5p: 'We may update these terms from time to time. Continued use of the site after changes take effect constitutes acceptance of the revised terms.',
      pp_h1: 'Privacy policy',
      pp_s1h: 'What we collect', pp_s1p: 'Contact and shipping details you provide at checkout, order history, and basic analytics about how the site is used. We do not store payment card numbers — those are handled by our payment processor.',
      pp_s2h: 'How we use it', pp_s2p: 'To process and ship orders, provide support, send batch and COA updates you opt into, and improve the site. We never sell your personal data.',
      pp_s3h: 'Sharing', pp_s3p: 'We share the minimum necessary with shipping carriers and our payment processor to fulfil your order. They are bound to use it only for that purpose.',
      pp_s4h: 'Your rights', pp_s4p: 'You may request access to, correction of, or deletion of your personal data, and you can unsubscribe from marketing at any time via the link in any email.',
      pp_s5h: 'Contact', pp_s5p: 'For any privacy request, reach us through the details on the Contact page.',
      ra_h1: 'Research-use agreement', ra_intro: 'By placing an order you accept the following agreement.',
      ra_s1h: 'Acknowledgement of purpose', ra_s1p: 'You acknowledge that all products are intended solely for laboratory research and in-vitro experimentation, and are not for human or veterinary use, consumption, diagnosis, or treatment of any condition.',
      ra_s2h: 'Researcher status', ra_s2p: 'You represent that you are a qualified researcher or acting on behalf of a research institution, and that you have the training and facilities to handle research chemicals safely.',
      ra_s3h: 'Compliance', ra_s3p: 'You agree to comply with all applicable laws and institutional policies governing the import, possession, handling, and disposal of the materials you order.',
      ra_s4h: 'No resale for misuse', ra_s4p: 'You will not resell, relabel, or distribute any product for use outside its stated research purpose, nor to any party you believe intends such use.',
      ra_s5h: 'Assumption of risk', ra_s5p: 'You assume all risk and responsibility associated with the receipt, storage, handling, and use of the materials, and release TOP Pep from liability arising from misuse.',
      shp_h1: 'Shipping policy', shp_intro: 'This policy summarises how orders are dispatched and delivered.',
      shp_s1h: 'Dispatch times', shp_s1p: 'In-stock orders are dispatched within 24–48 hours of payment clearing. Orders placed before the daily cut-off enter same-day picking.',
      shp_s2h: 'Rates &amp; free shipping', shp_s2p: 'Standard tracked shipping is a flat rate and free on orders over €250. Express and United Kingdom options are available at checkout.',
      shp_s3h: 'Packaging', shp_s3p: 'All orders ship discreetly with no product references outside. Compounds arrive freeze-dried and shelf-stable, sealed against light and moisture — no cold chain required.',
      shp_s4h: 'Tracking', shp_s4p: 'A tracking link is emailed when your parcel is handed to the carrier. Transit times vary by destination and carrier.',
      shp_s5h: 'Returns', shp_s5p: 'Because these are sensitive research materials, we cannot accept returns of opened vials. Contact us within 7 days if an order arrives damaged or incorrect and we’ll make it right.',
      nav_impressum: 'Legal notice', im_h1: 'Legal notice',
      im_operator: 'Site operator', im_address: 'Registered address', im_email: 'Email',
      im_reg: 'Trade register no.', im_vat: 'VAT ID', im_responsible: 'Responsible for content',
      im_onrequest: 'Available on request', im_note: 'This legal notice will be completed with the trade-register and VAT numbers before commercial launch.'
    },
    de: {
      nav_shop: 'Katalog', nav_coa: 'COA', nav_quality: 'Qualität', nav_shipping: 'Versand', nav_wholesale: 'Großhandel', nav_partner: 'Partnerprogramm',
      sign_in: 'Anmelden', about: 'Über uns', faq: 'FAQ',
      add_to_cart: 'In den Warenkorb', select_options: 'Optionen wählen', tap_a_size: 'Tippe auf eine Größe, um sie hinzuzufügen',
      sale: 'Sale', best_seller: 'Bestseller', on_sale: 'Im Sale', clear: 'Auswahl aufheben', checkout: 'Zur Kasse',
      cat_peptides: 'Peptide', cat_capsules: 'Kapseln', cat_labsupplies: 'Laborbedarf', cat_topicals: 'Topische Produkte',
      your_cart: 'Dein Warenkorb', cart_empty: 'Dein Warenkorb ist leer', subtotal: 'Zwischensumme', browse: 'Katalog ansehen',
      free_ship_unlocked: 'Du hast <b>Gratisversand</b> freigeschaltet', away_free: 'bis zum <b>Gratisversand</b>',
      added_recon: 'Zur Rekonstitution hinzugefügt', ships_taxes: 'Versand &amp; Steuern werden an der Kasse berechnet.',
      in_stock_today: 'Auf Lager · Versand heute', ships_next: 'Auf Lager · Versand am nächsten Werktag',
      two_day: 'Lieferung in 2 Tagen — bei dir bis', select_size: 'Größe wählen', purity: 'Reinheit', form: 'Form', dispatch: 'Versand',
      same_day: 'Am selben Tag', same_day_dispatch: 'Versand am selben Tag', third_party: 'Drittanbieter-getestet', coa_per_lot: 'COA pro Charge', free_over: 'Gratisversand ab 250 €',
      categories: 'Kategorien', continue_shopping: 'Weiter einkaufen', search_ph: 'Wirkstoffe suchen…',
      popular: 'Beliebte Produkte', no_results: 'Keine Treffer für', results: 'Treffer',
      coa_verified: 'Verifiziert', coa_in_testing: 'In Prüfung', coa_report_soon: 'wird von Janoshik geprüft — Bericht folgt in Kürze',
      coa_verified_count: 'Chargen verifiziert', coa_coming_soon: 'Demnächst', coa_open_janoshik: 'Auf der offiziellen Janoshik-Seite öffnen', promo_code: 'Gutscheincode', promo_enter: 'Code eingeben', apply: 'Anwenden', search_lot_ph: 'Suche nach Wirkstoff',
      remove: 'Entfernen', qty: 'Menge', research_only: 'Nur für Forschungszwecke', free_shipping_over: 'Gratisversand ab',
      place_order: 'Bestellung aufgeben', order_placed: 'Bestellung aufgegeben ✓', secured_demo: 'Im nächsten Schritt erhältst du unsere Bankdaten und eine eindeutige Zahlungsreferenz. Es werden keine Kartendaten gespeichert.',
      order_summary: 'Bestellübersicht', shipping_word: 'Versand', total: 'Gesamt', free_word: 'Gratis',
      join: 'Abonnieren', nl_title: 'Labor-Updates, kein Spam.', nl_sub: 'Neue Chargen und COA-Berichte ein- bis zweimal im Monat. Kein Spam, jederzeit abbestellbar.', nl_done: 'Abonniert — bitte bestätige in deinem Postfach.',
      footer_desc: 'Forschungspeptide von akkreditierten Herstellern, unabhängig geprüft und diskret versendet.',
      f_catalog: 'Katalog', f_company: 'Unternehmen', f_support: 'Support', fl_all: 'Alle Produkte', fl_coa: 'Analysezertifikate (COA)',
      disclaimer: 'Alle Produkte werden ausschließlich für Labor- und In-vitro-Forschungszwecke verkauft. Nichts auf dieser Seite ist ein Arzneimittel, Lebensmittel, Kosmetikum oder Medizinprodukt, und nichts davon ist für den menschlichen oder tierischen Gebrauch, Verzehr oder die Verabreichung bestimmt. Mit der Bestellung bestätigst du, dass du ein qualifizierter Forscher bist.',
      rights: 'Nur für Forschungszwecke.', reset: 'Zurücksetzen', back_catalog: '← Zurück zum Katalog', description: 'Beschreibung', details: 'Details', specifications: 'Spezifikationen', coa_in_box: 'Gratis chargengenaues COA in jeder Box', results_for: 'Treffer für', product: 'Produkt', price: 'Preis', proceed_checkout: 'Zur Kasse gehen', contact_label: 'Kontakt', shipping_method: 'Versandart', payment: 'Zahlung', cart_empty_sub: 'Durchsuche den Katalog und füge extern getestete Forschungswirkstoffe hinzu — ein chargengenaues COA liegt jeder Bestellung bei.',
      all: 'Alle', the_catalog: 'Der Katalog', all_research: 'Alle Forschungswirkstoffe', shop_empty: 'In dieser Kategorie ist noch nichts — neue Ware kommt regelmäßig hinzu.',
      hero_eyebrow: 'Drittanbieter-getestet · Nur für Forschungszwecke', hero_h1: 'Jedes Vial kommt mit <span class="outline">Beweis</span>, nicht nur Versprechen.',
      hero_lede: 'TOP Pep bezieht und testet seine Forschungspeptide durch unabhängige Laboranalysen. Ein Analysezertifikat für getestete Chargen ist direkt auf der Produktseite einsehbar — echte Ergebnisse, keine bloßen Behauptungen.',
      next_business_day: 'Nächster Werktag', next_day_dispatch: 'Versand am nächsten Werktag',
      ag_eyebrow: 'Nur für Forschungszwecke', ag_h: 'Du musst mindestens 18 Jahre alt sein',
      ag_p: 'TOP Pep liefert Forschungssubstanzen ausschließlich für die In-vitro-Laboranwendung — nicht für den menschlichen oder tierischen Verzehr bestimmt. Indem du fortfährst, bestätigst du, dass du mindestens 18 Jahre alt bist und unseren <a href="/terms/">AGB</a> sowie der <a href="/legal-agreement/">Forschungsnutzungs-Vereinbarung</a> zustimmst.',
      ag_enter: 'Ja, ich bin 18 oder älter', ag_exit: 'Verlassen', ag_foot: 'HPLC + MS getestet · COA verfügbar · Diskreter Versand',
      bac_water: 'Bakteriostatisches Wasser 10 ml',
      hero_cta1: 'Katalog ansehen', hero_cta2: 'Analysezertifikate ansehen (COA)', stat_purity: 'Dokumentierte Reinheit', stat_compounds: 'Wirkstoffe auf Lager', stat_free: 'Gratisversand ab',
      sec_best: 'Der Katalog', sec_featured: 'Peptide', shop_all: 'Alle ansehen', browse_word: 'Ansehen',
      sec_glp_eyebrow: 'GLP-1 &amp; Stoffwechsel', sec_glp_h: 'Metabolische Forschung', sec_gh_eyebrow: 'Sekretagoga', sec_gh_h: 'Wachstumshormon-Peptide', sec_rec_eyebrow: 'Regeneration', sec_rec_h: 'Regeneration &amp; Heilung',
      promise1_h: 'Getestet, bevor es gelistet wird', promise1_p: 'Jede Charge wird unabhängig auf Identität und Reinheit geprüft, <em>bevor</em> sie in den Verkauf geht — nie erst nach einer Reklamation.',
      promise2_h: 'COA in jeder Box', promise2_p: 'Das Zertifikat zu deiner exakten Chargennummer liegt der Bestellung bei und bleibt öffentlich in unserer Bibliothek einsehbar.',
      promise3_h: 'Diskret &amp; mit Sendungsverfolgung', promise3_p: 'Neutrale, unbedruckte Verpackung mit Sendungsverfolgung — Versand innerhalb von 24–48 Stunden, Lieferung in die gesamte EU und nach Großbritannien.',
      faqt_eyebrow: 'Fragen', faqt_h: 'Bevor du bestellst', faqt_p: 'Reinheit, Verpackung, Lagerung — und was „nur für Forschungszwecke“ wirklich bedeutet. Die Kurzfassung.', faqt_all: 'Alle FAQs',
      faqt_q1: 'Liegt ein Analysenzertifikat (COA) bei?', faqt_a1: 'Ja. Jede Charge wird von einem Drittanbieter getestet; das chargengenaue COA liegt der Box bei und wird veröffentlicht, damit du es mit deinem Vial abgleichen kannst.',
      faqt_q2: 'Wie wird meine Bestellung verpackt?', faqt_a2: 'Diskret, ohne Produkthinweise auf der Außenseite — Versand innerhalb von 24–48 Stunden mit Sendungsverfolgung.',
      faqt_q3: 'Wie lagere ich lyophilisierte Peptide richtig?', faqt_a3: 'Versiegelte Vials sind bei –20 °C, lichtgeschützt, stabil. Nach der Rekonstitution gekühlt lagern und innerhalb des Zeitfensters deines Protokolls verwenden.',
      ship_protect: 'Versandschutz', ship_protect_sub: 'Deckt Verlust, Beschädigung oder ein hängendes Paket ab — wir versenden kostenlos neu',
      form_invalid: 'Bitte fülle die Pflichtfelder aus und gib eine gültige E-Mail-Adresse an.', form_sending: 'Wird gesendet…',
      form_ok_wholesale: 'Danke — deine Anfrage ist eingegangen. Wir prüfen Konten manuell und melden uns innerhalb von 1–2 Werktagen.',
      form_ok_partner: 'Danke — deine Bewerbung ist eingegangen. Wir prüfen Partner manuell und melden uns innerhalb von 1–2 Werktagen.',
      form_ok_contact: 'Danke — deine Nachricht ist unterwegs. An Werktagen antworten wir meist innerhalb weniger Stunden.',
      nav_contact: 'Kontakt',
      ct_h1: 'Kontaktiere uns', ct_lede: 'Frage zu einer Bestellung, einem COA oder zur Rekonstitution? Schreib uns — an Werktagen antworten wir meist innerhalb weniger Stunden.',
      ct_order: 'Bestellnummer (optional)', ct_msg: 'Deine Nachricht', ct_send: 'Nachricht senden', ct_name: 'Name',
      ph_first: 'Vorname', ph_last: 'Nachname', ph_email: 'E-Mail', ph_company: 'Firma (optional)', ph_phone: 'Telefon',
      wh_eb1: 'Großhandel &amp; Volumen', wh_h1: 'Bestellst du<br>in großen Mengen?',
      wh_p1: 'Kliniken, Wiederverkäufer und Forschungsgruppen erhalten feste Konten mit fixen Volumenpreisen, vollständiger COA-Dokumentation zu jeder Charge und Versandpriorität vor Einzelbestellungen. Nenn uns dein monatliches Volumen und wir stellen dir ein Programm zusammen.',
      wh_s1: 'Einheiten pro Bestellung', wh_s2: 'Geprüfte Konten', wh_s3: 'Ø Versandzeit', wh_cta: 'Großhandelspreise anfragen',
      wh_eb2: 'So funktioniert’s', wh_h2: 'Skaliert nach deiner Bestellmenge',
      wh_c1: '<b>Staffelpreise</b> ab 15 Einheiten', wh_c2: '<b>Direkter Ansprechpartner</b> für die Abwicklung', wh_c3: '<b>Chargen-COAs</b> bei jeder Lieferung inklusive', wh_c4: '<b>Flexible Zahlungsziele</b> für verifizierte Partner', wh_c5: '<b>Feste Lieferslots</b> für Stammkunden',
      wh_feb: 'Kontakt aufnehmen', wh_fh: 'Richte dein Konto ein', wh_fp: 'Teile uns mit, welche Produkte dich interessieren, dein erwartetes Monatsvolumen und die Bestellfrequenz — Konten werden manuell geprüft, bevor Preise freigegeben werden.',
      wh_ph_msg: 'Interessante Produkte, geschätztes Volumen, Bestellfrequenz', wh_send: 'Anfrage senden',
      q_eb: 'Qualität &amp; Tests', q_h1: 'Geprüft, bevor es gelistet wird — nicht erst nach einer Reklamation.',
      q_p1: 'Jede Charge wird von Janoshik unabhängig analysiert, bevor sie in den Katalog kommt — und das Original-Zertifikat wird veröffentlicht, damit du es selbst prüfen kannst.',
      q_s1: 'HPLC-Reinheit', q_s2: 'Kernmethoden', q_s3: 'Unabhängiges Labor',
      q_meb: 'Die Methoden', q_mh: 'Sieben Prüfungen pro Charge — getestet von Janoshik',
      q_m1h: 'Reverse-Phase-HPLC', q_m1p: 'Die Reinheit wird gegen Referenzstandards quantifiziert — Janoshiks Kerntest und die wichtigste Zahl auf jedem Zertifikat.',
      q_m2h: 'Massenspektrometrie (LC-MS)', q_m2p: 'Die molekulare Identität wird per Masse-Ladungs-Analyse bestätigt — der Wirkstoff ist, was das Etikett verspricht, kein Ersatzstoff.',
      q_m3h: 'TFA-Gehalt', q_m3p: 'Restliche Trifluoressigsäure wird gemessen — relevant für Synthese-Nebenprodukte, die die HPLC-Reinheit allein nicht anzeigt.',
      q_m4h: 'Endotoxin (LAL)', q_m4p: 'Bakterielle Endotoxinwerte werden gegen einen definierten Grenzwert geprüft.',
      q_m5h: 'Sterilität', q_m5p: 'Wird getrennt von der Reinheit geprüft — eine chemisch reine Charge kann trotzdem bakteriell verunreinigt sein, deshalb wird separat getestet.',
      q_m6h: 'Schwermetalle', q_m6p: 'Elementare Spurenverunreinigungen werden auf Anfrage geprüft, wenn es für die Charge relevant ist.',
      q_m7h: 'Chargen-Archivierung', q_m7p: 'Jede Charge trägt eine eindeutige Lot-ID, die mit ihrem Janoshik-COA verknüpft ist — direkt auf janoshik.com verifizierbar, exakte Unterlagen zum exakten Vial.',
      q_peb: 'Der Prozess', q_ph: 'Von der Synthese bis auf deinen Labortisch',
      q_p1h: 'Nach Spezifikation synthetisiert', q_p1p: 'Nach definierter Spezifikation hergestellt und zu einem lagerstabilen Pulver lyophilisiert — versiegelt gegen Licht und Feuchtigkeit.',
      q_p2h: 'Unabhängig von Janoshik analysiert', q_p2p: 'Alle unsere Peptide werden stichprobenartig von Janoshik Analytical auf HPLC-Reinheit und MS-Identität getestet. Wir benoten unsere Arbeit nicht selbst.',
      q_p3h: 'Zertifikat veröffentlicht', q_p3p: 'Das COA ist direkt auf der Produktseite verfügbar — die Original-Testergebnisse von Janoshik.',
      q_p4h: 'Versiegelt &amp; versendet', q_p4p: 'Vials aus getesteten Chargen werden versiegelt und diskret versendet.',
      q_ceb: 'Auf dem Zertifikat', q_ch: 'Nachweis statt Versprechen',
      q_cp: 'Ein Zertifikat zählt nur, wenn es einer Überprüfung standhält. Jedes TOP-Pep-COA führt zu einer Charge zurück, die du selbst prüfen kannst — nichts hier musst du uns einfach glauben.',
      q_cc1: 'HPLC-Reinheit, gemessen an Referenzstandards', q_cc2: 'Identität bestätigt per Massenspektrometrie &amp; Molekulargewicht', q_cc3: 'Unabhängig von Janoshik getestet — wir korrigieren unsere Hausaufgaben nicht selbst',
      q_cbtn: 'Zur COA-Suche &rarr;',
      sp_eb: 'Diskreter &amp; zuverlässiger Versand', sp_h: 'Sicher verpackt,<br>diskret geliefert.',
      sp_p: 'Jede Bestellung wird mit derselben Sorgfalt behandelt wie der Wirkstoff selbst — versiegelt, transportsicher verpackt und ohne jede Kennzeichnung verschickt, die verrät, was drin ist.',
      sp_s2: 'Versandkostenfrei', sp_s3v: 'Neutral', sp_s3: 'Unauffällige Verpackung',
      sp_beb: 'Gebaut, um heil anzukommen', sp_bh: 'Gefriergetrocknet &amp; lagerstabil',
      sp_b1h: 'Keine Kühlung nötig', sp_b1p: 'Die Wirkstoffe sind zu einem stabilen Pulver lyophilisiert und vor Licht und Feuchtigkeit geschützt — keine Kühlkette, kein Eilversand nötig.',
      sp_b2h: 'Versiegelt zu deinem Schutz', sp_b2p: 'Vials werden versiegelt verschickt — so erkennst du sofort, ob unterwegs etwas manipuliert wurde.',
      sp_b3h: 'Laborergebnisse zu jeder Charge', sp_b3p: 'Das COA zu deinem Produkt ist auf der Website veröffentlicht — das echte Testergebnis, kein generisches Datenblatt.',
      sp_teb: 'Versiegelt &amp; verfolgbar', sp_th: 'Verpackt und unterwegs',
      sp_tp: 'Jede Bestellung wird innerhalb von 1 Werktag verpackt und dem Versanddienst übergeben — neutrale Außenverpackung, kein Branding, mit Tracking sofort beim Versand.',
      sp_t1: 'Bestellungen über 250 € versandkostenfrei', sp_t2: 'Tracking inklusive — du bekommst es, sobald deine Bestellung rausgeht', sp_t3: 'Diskrete Verpackung — außen verrät nichts den Inhalt', sp_t4: 'Lieferung in die ganze EU',
      sp_faq: 'Zu den FAQs', sp_contact: 'Kontaktiere uns',
      pt_eb: 'Partnerprogramm', pt_h1: 'Werde Partner für <span class="accent">Premium</span>-Forschungspeptide',
      pt_lede: 'Verdiene 20–40 % Provision auf jede vermittelte Bestellung. Je mehr du verkaufst, desto mehr verdienst du — mit transparentem Tracking und zuverlässigen monatlichen Auszahlungen.',
      pt_cta: 'Partner werden &rarr;',
      pt_s1: 'Gestaffelte Provision', pt_s2v: '5 Stufen', pt_s2: 'Leistungsstufen', pt_s3v: '30 Tage', pt_s3: 'Cookie-Laufzeit', pt_s4v: 'Monatlich', pt_s4: 'Auszahlungen per PayPal',
      pt_earn_h: 'Beispielhafte Monatseinnahmen', pt_earn_r1: 'Bis 10.000 € Umsatz &middot; 20 %', pt_earn_r2: 'Wiederkehrende Bestellungen',
      pt_why_pill: 'Warum TOP Pep', pt_why_h: 'Eine <span class="accent">Partnerschaft</span> für Forschungspeptide', pt_why_sub: 'Branchenführende Provisionen für unabhängig getestete Premium-Forschungspeptide.',
      pt_sr1: '<b>Gestaffelt</b>Provisionssätze', pt_sr2: '<b>Stufen</b>Leistungsstufen', pt_sr3: '<b>PayPal</b>Auszahlungen', pt_sr4: '<b>Aktive</b>Partner',
      pt_f1h: 'Premium-Forschungspeptide', pt_f1p: '&gt;99 % reine Peptide in Forschungsqualität mit konstanter, dokumentierter Qualität.',
      pt_f2h: 'Einfacher Einstieg', pt_f2p: 'Starte in wenigen Minuten mit deinem persönlichen Affiliate-Code — ohne Wartezeit auf Freigaben.',
      pt_f3h: 'Tracking in Echtzeit', pt_f3p: 'Verfolge Klicks, Conversions und Provisionen sofort in deinem Dashboard.',
      pt_gs_pill: 'Loslegen', pt_gs_h: 'So <span class="accent">funktioniert’s</span>', pt_gs_sub: 'Verdiene in wenigen Minuten — mit unserem einfachen Affiliate-Prozess.',
      pt_st1h: 'Registrieren', pt_st1p: 'Erstelle dein Konto und erhalte sofort deinen persönlichen Affiliate-Code.',
      pt_st2h: 'Teilen', pt_st2p: 'Empfiehl TOP Pep deiner Community mit deinem Referral-Link.',
      pt_st3h: 'Verdienen', pt_st3p: 'Starte mit 20 % Provision und steigere dich auf bis zu 40 %, wenn dein Umsatz wächst.',
      pt_st4h: 'Auszahlung', pt_st4p: 'Erhalte monatliche Auszahlungen per PayPal — ohne Mindestbetrag.',
      pt_ex_h: 'Provisionsstufen &amp; Beispielverdienste',
      pt_ex_r2: 'Ab 10.000 € Umsatz &middot; 25 %', pt_ex_r3: 'Ab 25.000 € Umsatz &middot; 30 %', pt_ex_r4: 'Ab 50.000 € Umsatz &middot; 35 %', pt_ex_r5: 'Ab 100.000 € Umsatz &middot; 40 %',
      pt_ex_note: 'Der Provisionssatz wächst mit deinem monatlich vermittelten Umsatz.',
      pt_su_eb: 'Partner werden', pt_su_h: 'Bewirb dich für das Programm', pt_su_p: 'Sag uns, wo du promoten willst und wie groß deine Reichweite ist — die meisten Bewerbungen prüfen wir innerhalb von 1–2 Werktagen.',
      pt_ph_channel: 'Website, Social-Media-Handle oder Kanal', pt_ph_msg: 'Reichweite, Nische und wie du promoten möchtest', pt_apply: 'Jetzt bewerben',
      fq_sub: 'Antworten zu Tests, Lagerung, Versand und Support.', fq_seb: 'Support', fq_sh: 'Sprich mit einem Menschen',
      fq_q1: 'Werden die Produkte getestet?', fq_a1: 'Ja — die Chargen werden über Janoshik Analytical, ein unabhängiges Labor, per HPLC auf Reinheit und per Massenspektrometrie auf Identität getestet. Die Ergebnisse werden veröffentlicht, damit du sie selbst prüfen kannst.',
      fq_q2: 'Wo finde ich das Analysenzertifikat (COA)?', fq_a2: 'COAs stehen für getestete Chargen direkt auf der Produktseite und werden nach der Bestellung auch in deinem Konto gespeichert.',
      fq_q3: 'Wie lagere ich die Wirkstoffe am besten?', fq_a3: 'Sie kommen gefriergetrocknet und lichtgeschützt an — während des Versands ist keine Kühlung nötig. Für die Langzeitlagerung bei –20 °C und lichtgeschützt aufbewahren; Details stehen auf der Produktseite.',
      fq_q4: 'Wie schnell werden Bestellungen verschickt?', fq_a4: 'Lagerware wird noch am selben oder am nächsten Werktag verpackt und verschickt — das Tracking bekommst du sofort beim Versand. Schneller nötig? Expressversand gibt’s an der Kasse.',
      fq_q5: 'Wird meine Bestellung diskret verschickt?', fq_a5: 'Ja. Alles geht in neutraler, unbedruckter, manipulationssicherer Verpackung raus — nichts an der Box deutet auf den Inhalt hin.',
      fq_q6: 'Gibt es Großhandels- oder Mengenpreise?', fq_a6: 'Ja — für Labore, Kliniken und Wiederverkäufer: Mengenrabatte, Chargen-COAs und Zahlungsziele für qualifizierte Konten. Melde dich einfach bei uns.',
      fq_q7: 'Sind die Produkte für Menschen oder Tiere bestimmt?', fq_a7: 'Nein — ausschließlich für In-vitro-Laborforschung. Kein Arzneimittel, Lebensmittel oder Kosmetikum. Du musst bestätigen, dass du als qualifizierter Forscher bestellst.',
      fq_q8: 'Wie sieht eure Rückgaberegelung aus?', fq_a8: 'Da es sich um Forschungschemikalien handelt, ist der Kauf nach dem Versand final. Kommt etwas beschädigt oder falsch an, melde dich innerhalb von 7 Tagen und wir regeln das.',
      fq_sq1: 'Wie schnell bekomme ich eine Antwort?', fq_sa1: 'Unser Support antwortet zu Geschäftszeiten meist innerhalb von Minuten. Bei dringenden Bestellproblemen beginne deine Nachricht einfach mit „URGENT“.',
      fq_sq2: 'Wie verfolge ich meine Bestellung?', fq_sa2: 'Schick uns deine Bestellnummer im Chat und wir schauen das Tracking für dich nach. Beim Versand bekommst du außerdem automatisch eine E-Mail.',
      fq_sq3: 'Meine Bestellung kam beschädigt oder falsch an — was jetzt?', fq_sa3: 'Melde dich sofort mit deiner Bestellnummer und einem Foto des Problems. Wir kümmern uns so schnell wie möglich um Ersatz oder Erstattung.',
      fq_sq4: 'Helft ihr bei der Rekonstitution?', fq_sa4: 'Ja — unser Team führt dich durch die Rekonstitution für jedes Peptid im Katalog. Sag uns im Chat einfach, um welches es geht.',
      fq_sq5: 'Helft ihr mir bei der Produktauswahl für meine Forschung?', fq_sa5: 'Klar — beschreib uns, woran du arbeitest, und wir zeigen dir die passenden Peptide.',
      fq_sq6: 'Wie bekomme ich das COA zu meiner Bestellung?', fq_sa6: 'Schick uns deine Bestellnummer oder den Produktnamen im Chat und wir senden dir das COA der getesteten Charge.',
      fq_sq7: 'Meine Zahlung ist fehlgeschlagen — was soll ich tun?', fq_sa7: 'Meist hilft eine andere Karte oder Zahlungsmethode. Klappt es trotzdem nicht, schreib uns und wir finden gemeinsam die Ursache.',
      ab_eb: 'Über uns', ab_h1: 'Die Dokumentation ist das Produkt.',
      ab_p1: 'TOP Pep entstand aus einer einfachen Frustration: Forschungsmaterial, das nur auf Vertrauen verkauft wird — ohne Papiere. Wir haben zuerst die Papiere in Ordnung gebracht und dann den Katalog darum gebaut.',
      ab_s1: 'Gegründet', ab_s2: 'Quelle pro Wirkstoff', ab_s3: 'Chargen dokumentiert',
      ab_e1: 'Der Standard', ab_h2a: 'Nachweis vor Versprechen',
      ab_p2: 'Jeder kann ein Vial „hochrein“ nennen. Wir veröffentlichen die Zahl, verknüpfen sie mit deiner Charge und lassen das Zertifikat sprechen. Besteht eine Charge nicht, wird sie nicht verschickt — Marketing überholt bei uns nie die Daten.',
      ab_l1: 'So testen wir', ab_e2: 'Für wen wir das machen', ab_h2b: 'Gemacht für Leute, die das COA wirklich lesen',
      ab_p3: 'Unsere Kunden sind Labore, Studierende und unabhängige Forschende, denen wichtig ist, was wirklich im Vial steckt. Wir bauen für die Person, die die Chargennummer nachschlägt — denn sie hat recht damit.',
      ab_l2: 'Zur COA-Bibliothek',
      co_h1: 'Kasse', co_email: 'E-Mail-Adresse', co_news: 'Per E-Mail über neue Chargen &amp; COAs informieren', ship_addr: 'Lieferadresse',
      co_inst: 'Institution / Labor (optional)', co_addr: 'Straße', co_city: 'Stadt', co_zip: 'Postleitzahl', co_country: 'Land',
      co_ship1: 'Standard mit Tracking', co_ship1s: 'Alle EU-Länder, Versand in 24–48 h', co_ship1p: 'Gratis ab 250 €',
      co_ship2: 'Express', co_ship2s: 'Priorität, isoliert, 1–2 Tage', co_ship3: 'Vereinigtes Königreich', co_ship3s: 'Mit Tracking, 3–5 Tage',
      co_addons: 'Zur Bestellung hinzufügen', co_add: 'Hinzufügen', co_card: 'Karte',
      coa_subtitle: 'Janoshik-Testergebnisse', coa_page_h1: 'Analysezertifikate (COA)',
      sort_recommended: 'Empfohlen', sort_az: 'A → Z', sort_price_asc: 'Preis ↑', sort_price_desc: 'Preis ↓',
      acc_welcome: 'Willkommen zurück', acc_create_title: 'Konto erstellen', acc_signin: 'Anmelden', acc_create: 'Konto erstellen',
      acc_google: 'Mit Google fortfahren', acc_or_email: 'oder mit E-Mail', acc_name: 'Vollständiger Name', acc_pass: 'Passwort',
      acc_remember: 'Angemeldet bleiben', acc_forgot: 'Passwort vergessen?', acc_demo: 'Nur zur Demo — es wurde kein Konto erstellt.',
      pay_bank: 'Banküberweisung', pay_bank_body: 'Die Überweisungsdaten erhältst du nach der Bestellung per E-Mail; wir versenden nach Zahlungseingang.',
      pay_crypto: 'Krypto', pay_crypto_body: 'Zahle in BTC, ETH oder USDT. Wallet-Adresse und der genaue Betrag werden nach der Bestellung angezeigt.',
      cc_num: 'Kartennummer', cc_exp: 'Gültig bis', cc_cvc: 'Prüfziffer', co_added: 'Hinzugefügt',
      pay_confirm_title: 'Schließe deine Überweisung ab', pay_confirm_intro: 'Deine Bestellung ist reserviert. Überweise den Gesamtbetrag unten und gib die Zahlungsreferenz als Verwendungszweck an, damit wir sie deiner Bestellung zuordnen können — wir versenden, sobald das Geld eingegangen ist.',
      pay_amount: 'Betrag', pay_reference: 'Zahlungsreferenz', pay_account: 'Kontoinhaber', pay_iban: 'IBAN', pay_bic: 'BIC / SWIFT', pay_bankname: 'Bank',
      pay_copy: 'Kopieren', pay_copied: 'Kopiert ✓', pay_ref_hint: 'Gib genau diese Referenz als Verwendungszweck an, damit wir deine Überweisung finden.',
      pay_order_no: 'Bestellnummer', pay_status_pending: 'Zahlung ausstehend', pay_note_keep: 'Notiere dir deine Zahlungsreferenz — du brauchst sie für die Überweisung. Wir melden uns per E-Mail, sobald die Zahlung bestätigt ist.',
      pay_back_home: 'Zurück zur Startseite', pay_view_faq: 'Fragen zur Zahlung? Zu den FAQ', place_order_bt: 'Bestellen &amp; Bankdaten erhalten',
      pay_processing: 'Zahlung wird verarbeitet…',
      co_phone: 'Telefon (optional)', co_house: 'Hausnummer', accepted_cards: 'Akzeptierte Karten',
      sold_out: 'Ausverkauft', sold_out_note: 'Diese Größe ist derzeit ausverkauft.',
      ship_24h: 'Versand in 24h',
      lowstock_note: 'Einige Artikel in deiner Bestellung sind knapp auf Lager. Es kann sein, dass wir sie nachbestellen müssen — dann dauert der Versand 7–9 Werktage.',
      err_zip: 'Diese Postleitzahl passt nicht zum gewählten Land. Bitte prüfe sie.',
      err_zip_fmt: 'Die Postleitzahl für {country} muss {n} Ziffern haben.',
      warn_zip_city: 'PLZ {zip} gehört zu {city} — bitte prüfen.',
      warn_zip_unknown: 'Postleitzahl {zip} nicht gefunden — bitte prüfen.',
      zip_use_anyway: 'Adresse trotzdem verwenden',
      zip_checking: 'Adresse wird geprüft…',
      err_house_req: 'Bitte Hausnummer angeben.',
      err_house: 'Bitte gib eine Hausnummer an (z. B. 12, 12a).',
      err_phone: 'Bitte gib eine gültige Telefonnummer ein oder lass das Feld leer.',
      place_order_card: 'Mit Karte zahlen', pay_redirecting: 'Weiterleitung zur sicheren Zahlung…',
      pay_card_error: 'Die Kartenzahlung konnte leider nicht gestartet werden. Bitte versuche es erneut oder nutze die Banküberweisung.',
      pay_paid_title: 'Zahlung erhalten', pay_paid_intro: 'Vielen Dank — deine Kartenzahlung war erfolgreich. Wir bereiten dein Paket vor; Versand innerhalb von 1 Werktag, den Tracking-Link bekommst du per E-Mail.',
      pay_cancel_note: 'Zahlung abgebrochen — es wurde nichts belastet. Du kannst es erneut versuchen oder die Banküberweisung wählen.',
      pay_choose: 'Zahlungsart', pay_card_label: 'Karte', pay_card_sub: 'Jetzt sicher per Karte bezahlen.',
      pay_cod: 'Nachnahme', pay_cod_sub: 'Zahle bei Lieferung bar beim Kurier.',
      pay_cod_hint: 'Nachnahme ist nur für Bestellungen möglich, deren Artikel alle innerhalb von 24 Stunden versandfertig sind.',
      place_order_cod: 'Bestellen — Zahlung bei Lieferung',
      cod_confirm_title: 'Bestellung aufgegeben — Zahlung bei Lieferung', cod_confirm_intro: 'Vielen Dank! Deine Bestellung ist bestätigt. Halte den unten stehenden Betrag bitte bar bereit, um ihn bei Lieferung dem Kurier zu zahlen.',
      cod_amount_due: 'Bei Lieferung zu zahlen', cod_status: 'Nachnahme',
      tab_coa_tested: 'Diese Charge wurde von Janoshik durch einen Drittanbieter getestet (Task #{task}). <a href="{url}" target="_blank" rel="noopener" style="color:#fff;text-decoration:underline;">Verifizierten Bericht ansehen</a>.',
      tab_coa_testing: 'Dieser Wirkstoff wird derzeit bei Janoshik getestet — der verifizierte Bericht wird veröffentlicht, sobald er vorliegt, in unserer COA-Bibliothek.',
      tab_details_body: 'Wird als versiegeltes {form} in einem manipulationssicheren Vial geliefert. Rekonstituiere nach deinem eigenen Protokoll mit bakteriostatischem Wasser; wir geben keine Dosierungshinweise, da alle Produkte ausschließlich für die Laborforschung verkauft werden.',
      spec_storage: 'Lagerung', spec_storage_val: '–20 °C, vor Licht schützen', spec_use: 'Verwendung', spec_use_val: 'Nur Forschung', spec_coa_testing: 'In Prüfung',
      legal_updated: 'Zuletzt aktualisiert · 01.07.2026', legal_operated: 'TOP Pep wird von ORCA MARKETING AGENCY S.R.L. betrieben.',
      tc_h1: 'AGB',
      tc_s1h: 'Nur für Forschungszwecke', tc_s1p: 'Alle Produkte werden ausschließlich für die In-vitro-Labor- und Analyseforschung verkauft. Nichts davon ist ein Arzneimittel, Lebensmittel, Kosmetikum oder Medizinprodukt, und nichts ist für den menschlichen oder tierischen Gebrauch, Verzehr oder die Verabreichung bestimmt. Mit deiner Bestellung bestätigst du, dass du ein qualifizierter Forscher bist und das Material entsprechend handhabst.',
      tc_s2h: 'Voraussetzungen', tc_s2p: 'Du musst in deinem Rechtsraum volljährig und berechtigt sein, Forschungschemikalien an deinem Standort zu erwerben. Du bist dafür verantwortlich, dass der Erhalt und die Verwendung jedes Wirkstoffs in deinem Land rechtmäßig sind.',
      tc_s3h: 'Bestellungen &amp; Preise', tc_s3p: 'Die Preise sind in Euro angegeben und können sich ohne Ankündigung ändern. Wir können jede Bestellung nach eigenem Ermessen ablehnen oder stornieren, insbesondere wenn eine Charge die Prüfung nicht besteht oder wir nicht rechtmäßig an deine Adresse versenden können.',
      tc_s4h: 'Haftung', tc_s4p: 'Soweit gesetzlich zulässig, haftet TOP Pep — eine Marke der ORCA MARKETING AGENCY S.R.L. — nicht für eine Verwendung der Produkte über den angegebenen Forschungszweck hinaus. Du übernimmst die volle Verantwortung für sichere Handhabung, Lagerung und Entsorgung.',
      tc_s5h: 'Änderungen', tc_s5p: 'Wir können diese Bedingungen von Zeit zu Zeit aktualisieren. Die weitere Nutzung der Website nach Inkrafttreten von Änderungen gilt als Annahme der überarbeiteten Bedingungen.',
      pp_h1: 'Datenschutzerklärung',
      pp_s1h: 'Was wir erheben', pp_s1p: 'Kontakt- und Versanddaten, die du an der Kasse angibst, den Bestellverlauf sowie grundlegende Statistiken zur Nutzung der Website. Wir speichern keine Kartennummern — diese werden von unserem Zahlungsdienstleister verarbeitet.',
      pp_s2h: 'Wie wir sie verwenden', pp_s2p: 'Zur Abwicklung und zum Versand von Bestellungen, für den Support, zum Versand von Chargen- und COA-Updates, die du abonnierst, und zur Verbesserung der Website. Wir verkaufen deine personenbezogenen Daten niemals.',
      pp_s3h: 'Weitergabe', pp_s3p: 'Wir geben nur das Nötigste an Versanddienstleister und unseren Zahlungsdienstleister weiter, um deine Bestellung auszuführen. Diese dürfen die Daten ausschließlich zu diesem Zweck verwenden.',
      pp_s4h: 'Deine Rechte', pp_s4p: 'Du kannst Auskunft über deine personenbezogenen Daten sowie deren Berichtigung oder Löschung verlangen und dich jederzeit über den Link in jeder E-Mail vom Marketing abmelden.',
      pp_s5h: 'Kontakt', pp_s5p: 'Für Datenschutzanfragen erreichst du uns über die Angaben auf der Kontaktseite.',
      ra_h1: 'Forschungsnutzungs-Vereinbarung', ra_intro: 'Mit deiner Bestellung akzeptierst du die folgende Vereinbarung.',
      ra_s1h: 'Zweckbestätigung', ra_s1p: 'Du bestätigst, dass alle Produkte ausschließlich für die Laborforschung und In-vitro-Experimente bestimmt sind und nicht für den menschlichen oder tierischen Gebrauch, Verzehr, die Diagnose oder die Behandlung von Erkrankungen.',
      ra_s2h: 'Forscherstatus', ra_s2p: 'Du versicherst, dass du ein qualifizierter Forscher bist oder im Auftrag einer Forschungseinrichtung handelst und über die Ausbildung und Einrichtungen verfügst, um Forschungschemikalien sicher zu handhaben.',
      ra_s3h: 'Einhaltung', ra_s3p: 'Du verpflichtest dich, alle geltenden Gesetze und institutionellen Richtlinien für Import, Besitz, Handhabung und Entsorgung der bestellten Materialien einzuhalten.',
      ra_s4h: 'Kein Weiterverkauf zum Missbrauch', ra_s4p: 'Du wirst kein Produkt für eine Verwendung außerhalb seines angegebenen Forschungszwecks weiterverkaufen, umetikettieren oder weitergeben, auch nicht an Parteien, von denen du eine solche Verwendung annimmst.',
      ra_s5h: 'Risikoübernahme', ra_s5p: 'Du übernimmst alle Risiken und die Verantwortung im Zusammenhang mit Erhalt, Lagerung, Handhabung und Verwendung der Materialien und stellst TOP Pep von jeder Haftung frei, die aus Missbrauch entsteht.',
      shp_h1: 'Versandrichtlinie', shp_intro: 'Diese Richtlinie fasst zusammen, wie Bestellungen versendet und zugestellt werden.',
      shp_s1h: 'Versandzeiten', shp_s1p: 'Lagerware wird innerhalb von 24–48 Stunden nach Zahlungseingang versendet. Bestellungen vor dem täglichen Annahmeschluss gehen in die Kommissionierung am selben Tag.',
      shp_s2h: 'Kosten &amp; Gratisversand', shp_s2p: 'Der Standardversand mit Sendungsverfolgung erfolgt zum Pauschalpreis und ist ab 250 € gratis. Express- und Großbritannien-Optionen stehen an der Kasse zur Verfügung.',
      shp_s3h: 'Verpackung', shp_s3p: 'Alle Bestellungen werden diskret und ohne Produkthinweise auf der Außenseite versendet. Die Wirkstoffe kommen gefriergetrocknet und lagerstabil an, versiegelt gegen Licht und Feuchtigkeit — keine Kühlkette erforderlich.',
      shp_s4h: 'Sendungsverfolgung', shp_s4p: 'Ein Tracking-Link wird per E-Mail versendet, sobald dein Paket an den Versanddienst übergeben wird. Die Laufzeiten variieren je nach Ziel und Dienstleister.',
      shp_s5h: 'Rücksendungen', shp_s5p: 'Da es sich um empfindliche Forschungsmaterialien handelt, können wir geöffnete Vials nicht zurücknehmen. Melde dich innerhalb von 7 Tagen bei uns, wenn eine Bestellung beschädigt oder falsch ankommt, und wir bringen es in Ordnung.',
      nav_impressum: 'Impressum', im_h1: 'Impressum',
      im_operator: 'Seitenbetreiber', im_address: 'Geschäftsanschrift', im_email: 'E-Mail',
      im_reg: 'Handelsregisternummer', im_vat: 'USt-IdNr.', im_responsible: 'Inhaltlich verantwortlich',
      im_onrequest: 'Auf Anfrage', im_note: 'Dieses Impressum wird vor dem kommerziellen Start um Handelsregister- und USt-IdNr. ergänzt.'
    },
    ro: {
      nav_shop: 'Catalog', nav_coa: 'COA', nav_quality: 'Calitate', nav_shipping: 'Livrare', nav_wholesale: 'Angro', nav_partner: 'Program parteneri',
      sign_in: 'Autentificare', about: 'Despre', faq: 'Întrebări',
      add_to_cart: 'Adaugă în coș', select_options: 'Alege opțiunile', tap_a_size: 'Atinge o mărime pentru a o adăuga în coș',
      sale: 'Reducere', best_seller: 'Cel mai vândut', on_sale: 'La reducere', clear: 'Resetează', checkout: 'Finalizează comanda',
      cat_peptides: 'Peptide', cat_capsules: 'Capsule', cat_labsupplies: 'Consumabile de laborator', cat_topicals: 'Produse topice',
      your_cart: 'Coșul tău', cart_empty: 'Coșul tău este gol', subtotal: 'Subtotal', browse: 'Vezi catalogul',
      free_ship_unlocked: 'Ai deblocat <b>livrarea gratuită</b>', away_free: 'până la <b>livrare gratuită</b>',
      added_recon: 'Adăugat pentru reconstituire', ships_taxes: 'Transportul &amp; taxele se calculează la finalizare.',
      in_stock_today: 'În stoc · se expediază azi', ships_next: 'În stoc · se expediază în următoarea zi lucrătoare',
      two_day: 'Livrare în 2 zile — primești până pe', select_size: 'Alege mărimea', purity: 'Puritate', form: 'Formă', dispatch: 'Expediere',
      same_day: 'În aceeași zi', same_day_dispatch: 'Expediere în aceeași zi', third_party: 'Testat de terți', coa_per_lot: 'COA pe lot', free_over: 'Livrare gratuită peste 1.230 Lei',
      categories: 'Categorii', continue_shopping: 'Continuă cumpărăturile', search_ph: 'Caută compuși…',
      popular: 'Produse populare', no_results: 'Niciun rezultat pentru', results: 'rezultate',
      coa_verified: 'Verificat', coa_in_testing: 'În testare', coa_report_soon: 'în așteptare la Janoshik — raportul urmează în curând',
      coa_verified_count: 'loturi verificate', coa_coming_soon: 'În curând', coa_open_janoshik: 'Deschide pe site-ul oficial Janoshik', promo_code: 'Cod promoțional', promo_enter: 'Introdu codul', apply: 'Aplică', search_lot_ph: 'Caută după compus',
      remove: 'Elimină', qty: 'Cant.', research_only: 'Doar pentru cercetare', free_shipping_over: 'Livrare gratuită peste',
      place_order: 'Plasează comanda', order_placed: 'Comandă plasată ✓', secured_demo: 'La pasul următor primești datele noastre bancare și o referință de plată unică. Nu se stochează date de card.',
      order_summary: 'Sumar comandă', shipping_word: 'Transport', total: 'Total', free_word: 'Gratuit',
      join: 'Abonează-te', nl_title: 'Noutăți de laborator, fără spam.', nl_sub: 'Loturi noi și rapoarte COA o dată sau de două ori pe lună. Fără spam, te dezabonezi oricând.', nl_done: 'Te-ai abonat — verifică e-mailul pentru confirmare.',
      footer_desc: 'Peptide de cercetare de la producători acreditați, verificate independent și livrate discret.',
      f_catalog: 'Catalog', f_company: 'Companie', f_support: 'Asistență', fl_all: 'Toate produsele', fl_coa: 'Certificate de analiză (COA)',
      disclaimer: 'Toate produsele sunt vândute strict pentru utilizare în cercetare de laborator și in-vitro. Nimic de pe acest site nu este un medicament, aliment, cosmetic sau dispozitiv medical și nimic nu este destinat utilizării, consumului sau administrării umane ori veterinare. Prin plasarea comenzii confirmi că ești cercetător calificat.',
      rights: 'Doar pentru cercetare.', reset: 'Resetează', back_catalog: '← Înapoi la catalog', description: 'Descriere', details: 'Detalii', specifications: 'Specificații', coa_in_box: 'COA gratuit, per lot, în fiecare cutie', results_for: 'rezultate pentru', product: 'Produs', price: 'Preț', proceed_checkout: 'Continuă spre finalizare', contact_label: 'Contact', shipping_method: 'Metodă de livrare', payment: 'Plată', cart_empty_sub: 'Răsfoiește catalogul pentru a adăuga compuși de cercetare testați independent — fiecare comandă include un COA per lot.',
      all: 'Toate', the_catalog: 'Catalogul', all_research: 'Toți compușii de cercetare', shop_empty: 'Încă nimic în această categorie — adăugăm stoc nou regulat.',
      hero_eyebrow: 'Testat de terți · Doar pentru uz de cercetare', hero_h1: 'Fiecare flacon vine cu <span class="outline">dovezi</span>, nu doar promisiuni.',
      hero_lede: 'TOP Pep se aprovizionează și testează peptidele de cercetare prin analize efectuate în laboratoare independente. Un certificat de analiză pentru loturile testate este publicat direct pe pagina produsului — rezultate reale, nu simple afirmații.',
      next_business_day: 'Următoarea zi lucrătoare', next_day_dispatch: 'Expediere în următoarea zi lucrătoare',
      ag_eyebrow: 'Doar pentru uz de cercetare', ag_h: 'Trebuie să ai cel puțin 18 ani pentru a intra',
      ag_p: 'TOP Pep furnizează compuși de cercetare strict pentru uz de laborator in-vitro — nu sunt destinați consumului uman sau veterinar. Continuând, confirmi că ai cel puțin 18 ani și ești de acord cu <a href="/terms/">Termenii &amp; Condițiile</a> și <a href="/legal-agreement/">Acordul de utilizare în cercetare</a>.',
      ag_enter: 'Da, am 18 ani sau mai mult', ag_exit: 'Ieși', ag_foot: 'Testat HPLC + MS · COA disponibil · Livrare discretă',
      bac_water: 'Apă bacteriostatică 10 ml',
      hero_cta1: 'Vezi catalogul', hero_cta2: 'Vezi certificatele de analiză (COA)', stat_purity: 'Puritate documentată', stat_compounds: 'Compuși în stoc', stat_free: 'Livrare gratuită peste',
      sec_best: 'Catalogul', sec_featured: 'Peptide', shop_all: 'Vezi toate', browse_word: 'Explorează',
      sec_glp_eyebrow: 'GLP-1 &amp; metabolism', sec_glp_h: 'Cercetare metabolică', sec_gh_eyebrow: 'Secretagogi', sec_gh_h: 'Peptide pentru hormonul de creștere', sec_rec_eyebrow: 'Reparare', sec_rec_h: 'Recuperare &amp; vindecare',
      promise1_h: 'Testat înainte de listare', promise1_p: 'Fiecare lot este verificat de terți pentru identitate și puritate <em>înainte</em> de a fi pus în vânzare — niciodată după o reclamație.',
      promise2_h: 'COA în fiecare cutie', promise2_p: 'Certificatul aferent lotului tău exact vine odată cu comanda și rămâne public în biblioteca noastră.',
      promise3_h: 'Discret &amp; cu urmărire', promise3_p: 'Ambalaj neutru, fără branding, cu urmărire — expediat în 24–48 de ore și livrat în toată UE și în Regatul Unit.',
      faqt_eyebrow: 'Întrebări', faqt_h: 'Înainte să comanzi', faqt_p: 'Puritate, ambalare, depozitare — și ce înseamnă de fapt „doar pentru cercetare”. Pe scurt.', faqt_all: 'Toate întrebările',
      faqt_q1: 'Este inclus un Certificat de Analiză (COA)?', faqt_a1: 'Da. Fiecare lot este testat de terți, iar COA-ul aferent lotului vine în cutie și este publicat, ca să îl poți verifica cu flaconul tău.',
      faqt_q2: 'Cum este ambalată comanda mea?', faqt_a2: 'Discret, fără nicio referire la produs pe exterior, și expediat în 24–48 de ore cu urmărire.',
      faqt_q3: 'Cum se păstrează corect peptidele liofilizate?', faqt_a3: 'Flacoanele sigilate sunt stabile la –20 °C, ferite de lumină. După reconstituire, păstrează-le la frigider și folosește-le în intervalul protocolului tău.',
      ship_protect: 'Protecția transportului', ship_protect_sub: 'Acoperă pierderea, deteriorarea sau un colet blocat — retrimitem gratuit',
      form_invalid: 'Te rugăm să completezi câmpurile obligatorii cu un e-mail valid.', form_sending: 'Se trimite…',
      form_ok_wholesale: 'Mulțumim — cererea ta a fost trimisă. Verificăm conturile manual și răspundem în 1–2 zile lucrătoare.',
      form_ok_partner: 'Mulțumim — aplicația ta a fost trimisă. Verificăm partenerii manual și răspundem în 1–2 zile lucrătoare.',
      form_ok_contact: 'Mulțumim — mesajul tău e pe drum. În zilele lucrătoare răspundem de obicei în câteva ore.',
      nav_contact: 'Contact',
      ct_h1: 'Contactează-ne', ct_lede: 'Ai o întrebare despre o comandă, un COA sau reconstituire? Scrie-ne — în zilele lucrătoare răspundem de obicei în câteva ore.',
      ct_order: 'Număr comandă (opțional)', ct_msg: 'Mesajul tău', ct_send: 'Trimite mesajul', ct_name: 'Nume',
      ph_first: 'Prenume', ph_last: 'Nume', ph_email: 'E-mail', ph_company: 'Companie (opțional)', ph_phone: 'Telefon',
      wh_eb1: 'Angro &amp; volum', wh_h1: 'Comanzi<br>în volum?',
      wh_p1: 'Clinicile, revânzătorii și grupurile de cercetare primesc conturi permanente cu prețuri fixe de volum, documentație COA completă pentru fiecare lot și prioritate la expediere înaintea comenzilor individuale. Spune-ne volumul tău lunar și îți pregătim un program.',
      wh_s1: 'Unități per comandă', wh_s2: 'Conturi aprobate', wh_s3: 'Timp mediu de expediere', wh_cta: 'Cere prețuri en-gros',
      wh_eb2: 'Cum funcționează', wh_h2: 'Scalat după cât comanzi',
      wh_c1: '<b>Prețuri pe niveluri</b> începând de la 15 unități', wh_c2: '<b>Persoană de contact directă</b> pentru comenzi', wh_c3: '<b>COA-uri per lot</b> incluse la fiecare livrare', wh_c4: '<b>Termene de plată flexibile</b> pentru parteneri verificați', wh_c5: '<b>Sloturi de livrare recurente</b> pentru clienți fideli',
      wh_feb: 'Ia legătura cu noi', wh_fh: 'Configurează-ți contul', wh_fp: 'Spune-ne ce produse te interesează, volumul lunar estimat și frecvența comenzilor — conturile sunt verificate manual înainte de a debloca prețurile.',
      wh_ph_msg: 'Produse de interes, volum estimat, frecvența comenzilor', wh_send: 'Trimite cererea',
      q_eb: 'Calitate &amp; testare', q_h1: 'Verificat înainte de listare, nu după o reclamație.',
      q_p1: 'Fiecare lot este analizat independent de Janoshik înainte să ajungă în catalog — iar certificatul original este publicat ca să îl poți verifica singur.',
      q_s1: 'Puritate HPLC', q_s2: 'Metode de bază', q_s3: 'Laborator independent',
      q_meb: 'Metodele', q_mh: 'Șapte verificări pentru fiecare lot — testate de Janoshik',
      q_m1h: 'HPLC cu fază inversă', q_m1p: 'Puritatea este cuantificată față de standarde de referință — testul de bază Janoshik și cifra principală de pe fiecare certificat.',
      q_m2h: 'Spectrometrie de masă (LC-MS)', q_m2p: 'Identitatea moleculară este confirmată prin analiza masă-sarcină — compusul este ceea ce scrie pe etichetă, nu un substitut.',
      q_m3h: 'Conținut TFA', q_m3p: 'Se măsoară acidul trifluoroacetic rezidual — relevant pentru subprodusele de sinteză pe care puritatea HPLC singură nu le semnalează.',
      q_m4h: 'Endotoxine (LAL)', q_m4p: 'Nivelurile de endotoxine bacteriene sunt verificate față de un prag definit.',
      q_m5h: 'Sterilitate', q_m5p: 'Verificată separat de puritate — un lot pur chimic poate totuși avea contaminare bacteriană, așa că se testează separat.',
      q_m6h: 'Metale grele', q_m6p: 'Contaminanții elementari în urme sunt verificați la cerere, pentru loturile unde contează.',
      q_m7h: 'Arhivare per lot', q_m7p: 'Fiecare lot are un Lot ID unic, legat de COA-ul său Janoshik — verificabil direct pe janoshik.com, documentele exacte pentru flaconul exact.',
      q_peb: 'Procesul', q_ph: 'De la sinteză până pe masa ta de lucru',
      q_p1h: 'Sintetizat conform specificației', q_p1p: 'Produs după o specificație definită și liofilizat într-o pulbere stabilă — sigilat împotriva luminii și umidității.',
      q_p2h: 'Analizat independent de Janoshik', q_p2p: 'Toate peptidele noastre sunt testate de Janoshik Analytical pentru puritate HPLC și identitate MS. Nu ne notăm singuri munca.',
      q_p3h: 'Certificat publicat', q_p3p: 'COA-ul este disponibil direct pe pagina produsului — rezultatele originale de la Janoshik.',
      q_p4h: 'Sigilat &amp; expediat', q_p4p: 'Flacoanele din loturile testate sunt sigilate și expediate discret.',
      q_ceb: 'Pe certificat', q_ch: 'Dovezi, nu promisiuni',
      q_cp: 'Un certificat contează doar dacă rezistă la verificare. Fiecare COA TOP Pep duce înapoi la un lot pe care îl poți verifica singur — nimic de aici nu trebuie luat pe cuvânt.',
      q_cc1: 'Puritate HPLC, raportată la standarde de referință', q_cc2: 'Identitate confirmată prin spectrometrie de masă &amp; greutate moleculară', q_cc3: 'Testat independent de Janoshik — nu ne corectăm singuri temele',
      q_cbtn: 'Deschide căutarea COA &rarr;',
      sp_eb: 'Livrare discretă &amp; sigură', sp_h: 'Împachetat bine,<br>livrat discret.',
      sp_p: 'Fiecare comandă este tratată cu aceeași grijă ca și compusul — sigilată, împachetată să reziste transportului și trimisă fără niciun însemn care să arate ce e înăuntru.',
      sp_s2: 'Transport gratuit', sp_s3v: 'Neutru', sp_s3: 'Ambalaj fără însemne',
      sp_beb: 'Făcut să ajungă intact', sp_bh: 'Liofilizat &amp; stabil la raft',
      sp_b1h: 'Nu necesită refrigerare', sp_b1p: 'Compușii sunt liofilizați într-o pulbere stabilă și protejați de lumină și umiditate — fără lanț de frig, fără livrare urgentă.',
      sp_b2h: 'Sigilat pentru protecția ta', sp_b2p: 'Flacoanele sunt livrate sigilate — vezi imediat dacă ceva a fost umblat pe drum.',
      sp_b3h: 'Rezultate de laborator pentru fiecare lot', sp_b3p: 'COA-ul produsului tău este publicat pe site — rezultatul real al testului, nu o fișă generică.',
      sp_teb: 'Sigilat &amp; urmărit', sp_th: 'Împachetat și pe drum',
      sp_tp: 'Fiecare comandă este împachetată și predată curierului în cel mult 1 zi lucrătoare — ambalaj exterior neutru, fără branding, cu tracking trimis imediat la expediere.',
      sp_t1: 'Comenzile peste 250 € au transport gratuit', sp_t2: 'Tracking inclus, trimis imediat ce comanda pleacă', sp_t3: 'Ambalaj discret — nimic pe exterior nu dă de gol conținutul', sp_t4: 'Livrare în toată UE',
      sp_faq: 'Citește FAQ-ul', sp_contact: 'Contactează-ne',
      pt_eb: 'Program de parteneriat', pt_h1: 'Devino partener pentru peptide de cercetare <span class="accent">premium</span>',
      pt_lede: 'Câștigă un comision de 20–40% la fiecare comandă recomandată. Cu cât vinzi mai mult, cu atât câștigi mai mult — cu tracking transparent și plăți lunare fiabile.',
      pt_cta: 'Devino partener &rarr;',
      pt_s1: 'Comision pe niveluri', pt_s2v: '5 niveluri', pt_s2: 'Niveluri de performanță', pt_s3v: '30 de zile', pt_s3: 'Fereastră cookie', pt_s4v: 'Lunar', pt_s4: 'Plăți prin PayPal',
      pt_earn_h: 'Exemplu de câștig lunar', pt_earn_r1: 'Până la 10.000 € vânzări &middot; 20%', pt_earn_r2: 'Comenzi recurente',
      pt_why_pill: 'De ce TOP Pep', pt_why_h: '<span class="accent">Parteneriat</span> pentru peptide de cercetare', pt_why_sub: 'Comisioane de top pentru peptide premium, testate independent.',
      pt_sr1: '<b>Pe niveluri</b>Rate de comision', pt_sr2: '<b>Niveluri</b>Trepte de performanță', pt_sr3: '<b>PayPal</b>Plăți', pt_sr4: '<b>Activi</b>Parteneri',
      pt_f1h: 'Peptide de cercetare premium', pt_f1p: 'Peptide &gt;99% pure, de calitate constantă și documentată.',
      pt_f2h: 'Proces simplu', pt_f2p: 'Începi în câteva minute cu codul tău unic de afiliat — fără așteptări la aprobare.',
      pt_f3h: 'Urmărire în timp real', pt_f3p: 'Vezi instant clickurile, conversiile și comisioanele din dashboardul tău.',
      pt_gs_pill: 'Începe', pt_gs_h: 'Cum <span class="accent">funcționează</span>', pt_gs_sub: 'Începe să câștigi în câteva minute cu procesul nostru simplu de afiliere.',
      pt_st1h: 'Înscrie-te', pt_st1p: 'Creează-ți contul și primești instant codul tău unic de afiliat.',
      pt_st2h: 'Distribuie', pt_st2p: 'Promovează TOP Pep către audiența ta cu linkul tău de recomandare.',
      pt_st3h: 'Câștigă', pt_st3p: 'Începi cu 20% comision și urci până la 40% pe măsură ce vânzările cresc.',
      pt_st4h: 'Primești banii', pt_st4p: 'Primești plăți lunare prin PayPal, fără prag minim.',
      pt_ex_h: 'Niveluri de comision &amp; exemple de câștig',
      pt_ex_r2: 'De la 10.000 € vânzări &middot; 25%', pt_ex_r3: 'De la 25.000 € vânzări &middot; 30%', pt_ex_r4: 'De la 50.000 € vânzări &middot; 35%', pt_ex_r5: 'De la 100.000 € vânzări &middot; 40%',
      pt_ex_note: 'Rata comisionului crește odată cu vânzările lunare recomandate.',
      pt_su_eb: 'Devino partener', pt_su_h: 'Aplică la program', pt_su_p: 'Spune-ne unde vei promova și cât de mare e audiența ta — majoritatea aplicațiilor sunt evaluate în 1–2 zile lucrătoare.',
      pt_ph_channel: 'Site, cont social sau canal', pt_ph_msg: 'Mărimea audienței, nișa și cum plănuiești să promovezi', pt_apply: 'Aplică acum',
      fq_sub: 'Răspunsuri despre testare, depozitare, livrare și asistență.', fq_seb: 'Asistență', fq_sh: 'Vorbește cu un om',
      fq_q1: 'Sunt produsele testate?', fq_a1: 'Da — loturile sunt testate pentru puritate prin HPLC și identitate prin spectrometrie de masă la Janoshik Analytical, un laborator independent. Rezultatele sunt publicate ca să le poți verifica singur.',
      fq_q2: 'Unde găsesc Certificatul de Analiză (COA)?', fq_a2: 'COA-urile sunt listate direct pe pagina produsului pentru loturile testate și se salvează și în contul tău după comandă.',
      fq_q3: 'Cum se păstrează cel mai bine acești compuși?', fq_a3: 'Ajung liofilizați și protejați de lumină, deci nu e nevoie de refrigerare la transport. Pentru păstrare pe termen lung, ține-i la –20 °C, feriți de lumină — detaliile sunt pe pagina produsului.',
      fq_q4: 'Cât de repede pleacă comenzile?', fq_a4: 'Produsele din stoc sunt împachetate și expediate în aceeași zi sau în următoarea zi lucrătoare, iar trackingul îl primești imediat. Ai nevoie mai repede? Livrarea expres e disponibilă la checkout.',
      fq_q5: 'Comanda mea este livrată discret?', fq_a5: 'Da. Totul pleacă în ambalaj simplu, fără branding și cu sigiliu de siguranță — nimic de pe cutie nu indică conținutul.',
      fq_q6: 'Aveți prețuri en-gros sau de volum?', fq_a6: 'Da — pentru laboratoare, clinici și revânzători: reduceri de volum, COA-uri per lot și termene de plată pentru conturile eligibile. Contactează-ne să le configurăm.',
      fq_q7: 'Sunt aceste produse destinate uzului uman sau animal?', fq_a7: 'Nu — strict pentru cercetare de laborator in-vitro. Nu sunt medicamente, alimente sau cosmetice. Va trebui să confirmi că ești cercetător calificat.',
      fq_q8: 'Care este politica de retur?', fq_a8: 'Fiind substanțe chimice de cercetare, vânzarea este finală după expediere. Dacă ceva ajunge deteriorat sau greșit, anunță-ne în 7 zile și rezolvăm.',
      fq_sq1: 'Cât de repede primesc un răspuns?', fq_sa1: 'Echipa de suport răspunde de obicei în câteva minute în timpul programului. Dacă e urgent — o problemă de comandă care nu suferă amânare — începe mesajul cu „URGENT”.',
      fq_sq2: 'Cum îmi urmăresc comanda?', fq_sa2: 'Trimite-ne numărul comenzii în chat și îți căutăm trackingul. Primești oricum automat un e-mail când comanda pleacă.',
      fq_sq3: 'Comanda a ajuns deteriorată sau greșită — ce fac?', fq_sa3: 'Scrie-ne imediat cu numărul comenzii și o poză a problemei. Rezolvăm cât de repede putem cu o înlocuire sau rambursare.',
      fq_sq4: 'Mă puteți ajuta cu reconstituirea?', fq_sa4: 'Da — echipa te poate ghida pas cu pas la reconstituire pentru orice peptid din catalog. Spune-ne în chat despre care e vorba.',
      fq_sq5: 'Mă ajutați să aleg produsele pentru cercetarea mea?', fq_sa5: 'Sigur — spune-ne la ce lucrezi și îți recomandăm peptidele potrivite.',
      fq_sq6: 'Cum primesc COA-ul pentru comanda mea?', fq_sa6: 'Trimite-ne numărul comenzii sau numele produsului în chat și îți trimitem COA-ul lotului testat.',
      fq_sq7: 'Plata nu a mers — ce să fac?', fq_sa7: 'De obicei ajută schimbarea cardului sau a metodei de plată. Tot nu merge? Scrie-ne și ne dăm seama împreună ce se întâmplă.',
      ab_eb: 'Despre', ab_h1: 'Documentația este produsul.',
      ab_p1: 'TOP Pep a pornit dintr-o frustrare simplă: material de cercetare vândut doar pe încredere, fără acte. Am rezolvat mai întâi actele, apoi am construit catalogul în jurul lor.',
      ab_s1: 'Fondat', ab_s2: 'Sursă per compus', ab_s3: 'Loturi documentate',
      ab_e1: 'Standardul', ab_h2a: 'Dovezi înaintea promisiunilor',
      ab_p2: 'Oricine poate numi un flacon „de puritate înaltă”. Noi publicăm cifra, o legăm de lotul tău și lăsăm certificatul să vorbească. Dacă un lot nu trece, nu se livrează — la noi marketingul nu întrece niciodată datele.',
      ab_l1: 'Cum testăm', ab_e2: 'Pentru cine e', ab_h2b: 'Făcut pentru cei care chiar citesc COA-ul',
      ab_p3: 'Clienții noștri sunt laboratoare, studenți și cercetători independenți cărora le pasă ce e de fapt în flacon. Construim pentru omul care verifică numărul de lot — pentru că are dreptate să o facă.',
      ab_l2: 'Vezi biblioteca COA',
      co_h1: 'Finalizare comandă', co_email: 'Adresă de e-mail', co_news: 'Vreau să primesc pe e-mail noutăți despre loturi și COA-uri', ship_addr: 'Adresă de livrare',
      co_inst: 'Instituție / laborator (opțional)', co_addr: 'Stradă', co_city: 'Oraș', co_zip: 'Cod poștal', co_country: 'Țară',
      co_ship1: 'Standard cu tracking', co_ship1s: 'Toate țările UE, expediere în 24–48h', co_ship1p: 'Gratuit peste 250 €',
      co_ship2: 'Express', co_ship2s: 'Prioritar, izolat, 1–2 zile', co_ship3: 'Regatul Unit', co_ship3s: 'Cu tracking, 3–5 zile',
      co_addons: 'Adaugă la comandă', co_add: 'Adaugă', co_card: 'Card',
      coa_subtitle: 'Rezultatele testelor Janoshik', coa_page_h1: 'Certificate de analiză (COA)',
      sort_recommended: 'Recomandate', sort_az: 'A → Z', sort_price_asc: 'Preț ↑', sort_price_desc: 'Preț ↓',
      acc_welcome: 'Bine ai revenit', acc_create_title: 'Creează-ți contul', acc_signin: 'Autentificare', acc_create: 'Creează cont',
      acc_google: 'Continuă cu Google', acc_or_email: 'sau cu e-mail', acc_name: 'Nume complet', acc_pass: 'Parolă',
      acc_remember: 'Ține-mă minte', acc_forgot: 'Ai uitat parola?', acc_demo: 'Doar demo — nu a fost creat niciun cont.',
      pay_bank: 'Transfer bancar', pay_bank_body: 'Detaliile de transfer îți sunt trimise pe e-mail după plasarea comenzii; expediem la confirmarea plății.',
      pay_crypto: 'Cripto', pay_crypto_body: 'Plătește în BTC, ETH sau USDT. Adresa portofelului și suma exactă apar după plasarea comenzii.',
      cc_num: 'Număr card', cc_exp: 'Expiră', cc_cvc: 'CVC', co_added: 'Adăugat',
      pay_confirm_title: 'Finalizează transferul bancar', pay_confirm_intro: 'Comanda ta este rezervată. Transferă totalul de mai jos și adaugă referința de plată ca detaliu, ca să o putem asocia comenzii tale — expediem imediat ce banii ajung.',
      pay_amount: 'Sumă', pay_reference: 'Referință de plată', pay_account: 'Nume titular cont', pay_iban: 'IBAN', pay_bic: 'BIC / SWIFT', pay_bankname: 'Bancă',
      pay_copy: 'Copiază', pay_copied: 'Copiat ✓', pay_ref_hint: 'Adaugă exact această referință ca detaliu al plății, ca să găsim transferul tău.',
      pay_order_no: 'Număr comandă', pay_status_pending: 'În așteptarea plății', pay_note_keep: 'Notează-ți referința de plată — îți va trebui pentru transfer. Îți scriem pe e-mail imediat ce plata este confirmată.',
      pay_back_home: 'Înapoi la pagina principală', pay_view_faq: 'Întrebări despre plată? Vezi FAQ', place_order_bt: 'Plasează comanda &amp; obține datele bancare',
      pay_processing: 'Se procesează plata…',
      co_phone: 'Telefon (opțional)', co_house: 'Număr casă', accepted_cards: 'Carduri acceptate',
      sold_out: 'Epuizat', sold_out_note: 'Această mărime este epuizată momentan.',
      ship_24h: 'Livrare în 24h',
      lowstock_note: 'Unele articole din comanda ta sunt pe terminate și ar putea necesita reaprovizionare — în acest caz, expedierea durează 7–9 zile lucrătoare.',
      err_zip: 'Acest cod poștal nu corespunde țării selectate. Te rugăm să îl verifici.',
      err_zip_fmt: 'Codul poștal pentru {country} trebuie să aibă {n} cifre.',
      warn_zip_city: 'Codul poștal {zip} aparține de {city} — te rugăm să verifici.',
      warn_zip_unknown: 'Codul poștal {zip} nu a fost găsit — te rugăm să verifici.',
      zip_use_anyway: 'Folosește totuși adresa',
      zip_checking: 'Se verifică adresa…',
      err_house_req: 'Te rugăm să introduci numărul casei.',
      err_house: 'Te rugăm să incluzi numărul casei (ex. 12, 12a).',
      err_phone: 'Introdu un număr de telefon valid sau lasă câmpul gol.',
      place_order_card: 'Plătește cu cardul', pay_redirecting: 'Redirecționare către plata securizată…',
      pay_card_error: 'Ne pare rău, nu am putut începe plata cu cardul. Încearcă din nou sau folosește transferul bancar.',
      pay_paid_title: 'Plată primită', pay_paid_intro: 'Mulțumim — plata cu cardul a reușit. Pregătim coletul acum; se expediază într-o zi lucrătoare și vei primi linkul de urmărire pe e-mail.',
      pay_cancel_note: 'Plată anulată — nu a fost debitat nimic. Poți încerca din nou sau alege transferul bancar.',
      pay_choose: 'Metodă de plată', pay_card_label: 'Card', pay_card_sub: 'Plătește acum securizat cu cardul.',
      pay_cod: 'Plată ramburs', pay_cod_sub: 'Plătești cash curierului la livrare.',
      pay_cod_hint: 'Plata ramburs este disponibilă doar pentru comenzile cu produse care pot fi expediate în 24 de ore.',
      place_order_cod: 'Plasează comanda — plată ramburs',
      cod_confirm_title: 'Comandă plasată — plată ramburs', cod_confirm_intro: 'Mulțumim! Comanda ta este confirmată. Te rugăm să ai la tine suma de mai jos în numerar, pentru a o plăti curierului la livrarea coletului.',
      cod_amount_due: 'De plată la livrare', cod_status: 'Plată ramburs',
      tab_coa_tested: 'Acest lot este testat de terți la Janoshik (task #{task}). <a href="{url}" target="_blank" rel="noopener" style="color:#fff;text-decoration:underline;">Vezi raportul verificat</a>.',
      tab_coa_testing: 'Acest compus este în curs de testare la Janoshik — raportul verificat va fi publicat în biblioteca noastră COA imediat ce este gata.',
      tab_details_body: 'Livrat ca {form} sigilat într-un flacon cu sigiliu de siguranță. Reconstituie cu apă bacteriostatică conform propriului protocol; nu oferim indicații de dozare, deoarece toate produsele se vând strict pentru cercetare de laborator.',
      spec_storage: 'Depozitare', spec_storage_val: '–20 °C, ferit de lumină', spec_use: 'Utilizare', spec_use_val: 'Doar cercetare', spec_coa_testing: 'În testare',
      legal_updated: 'Ultima actualizare · 01.07.2026', legal_operated: 'TOP Pep este operat de ORCA MARKETING AGENCY S.R.L.',
      tc_h1: 'Termeni &amp; condiții',
      tc_s1h: 'Doar pentru uz de cercetare', tc_s1p: 'Toate produsele sunt vândute strict pentru cercetare de laborator și analitică in-vitro. Nimic din ceea ce oferim nu este medicament, aliment, cosmetic sau dispozitiv medical și nimic nu este destinat utilizării, consumului sau administrării umane ori veterinare. Prin plasarea comenzii confirmi că ești cercetător calificat și că vei manipula materialul în consecință.',
      tc_s2h: 'Eligibilitate', tc_s2p: 'Trebuie să ai vârsta legală în jurisdicția ta și să ai dreptul de a cumpăra substanțe chimice de cercetare acolo unde te afli. Ești responsabil să te asiguri că primirea și utilizarea oricărui compus sunt legale în țara ta.',
      tc_s3h: 'Comenzi &amp; prețuri', tc_s3p: 'Prețurile sunt afișate în euro și se pot modifica fără notificare. Putem refuza sau anula orice comandă la discreția noastră, inclusiv atunci când un lot nu trece de verificare sau când nu putem livra legal la adresa ta.',
      tc_s4h: 'Răspundere', tc_s4p: 'În măsura maximă permisă de lege, TOP Pep — o marcă operată de ORCA MARKETING AGENCY S.R.L. — nu răspunde pentru nicio utilizare a produselor dincolo de scopul lor de cercetare declarat. Îți asumi întreaga responsabilitate pentru manipularea, depozitarea și eliminarea în siguranță.',
      tc_s5h: 'Modificări', tc_s5p: 'Putem actualiza acești termeni din când în când. Utilizarea în continuare a site-ului după intrarea în vigoare a modificărilor constituie acceptarea termenilor revizuiți.',
      pp_h1: 'Politică de confidențialitate',
      pp_s1h: 'Ce colectăm', pp_s1p: 'Datele de contact și de livrare pe care le furnizezi la finalizarea comenzii, istoricul comenzilor și statistici de bază despre modul în care este utilizat site-ul. Nu stocăm numere de card — acestea sunt gestionate de procesatorul nostru de plăți.',
      pp_s2h: 'Cum le folosim', pp_s2p: 'Pentru a procesa și expedia comenzile, a oferi asistență, a trimite noutăți despre loturi și COA-uri la care te abonezi și a îmbunătăți site-ul. Nu vindem niciodată datele tale personale.',
      pp_s3h: 'Partajare', pp_s3p: 'Partajăm strictul necesar cu firmele de curierat și cu procesatorul nostru de plăți pentru a-ți onora comanda. Aceștia sunt obligați să le folosească doar în acest scop.',
      pp_s4h: 'Drepturile tale', pp_s4p: 'Poți solicita accesul, corectarea sau ștergerea datelor tale personale și te poți dezabona oricând de la comunicările de marketing prin linkul din orice e-mail.',
      pp_s5h: 'Contact', pp_s5p: 'Pentru orice solicitare privind confidențialitatea, ne poți contacta prin datele de pe pagina de contact.',
      ra_h1: 'Acord de utilizare în cercetare', ra_intro: 'Prin plasarea unei comenzi accepți următorul acord.',
      ra_s1h: 'Recunoașterea scopului', ra_s1p: 'Recunoști că toate produsele sunt destinate exclusiv cercetării de laborator și experimentelor in-vitro și nu utilizării, consumului, diagnosticării sau tratării vreunei afecțiuni la om ori animale.',
      ra_s2h: 'Statut de cercetător', ra_s2p: 'Declari că ești cercetător calificat sau acționezi în numele unei instituții de cercetare și că ai pregătirea și dotările necesare pentru a manipula în siguranță substanțe chimice de cercetare.',
      ra_s3h: 'Conformitate', ra_s3p: 'Ești de acord să respecți toate legile aplicabile și politicile instituționale care reglementează importul, deținerea, manipularea și eliminarea materialelor pe care le comanzi.',
      ra_s4h: 'Fără revânzare pentru utilizare abuzivă', ra_s4p: 'Nu vei revinde, reeticheta sau distribui niciun produs pentru utilizare în afara scopului său de cercetare declarat și nici către vreo parte despre care crezi că intenționează o astfel de utilizare.',
      ra_s5h: 'Asumarea riscului', ra_s5p: 'Îți asumi toate riscurile și responsabilitatea legate de primirea, depozitarea, manipularea și utilizarea materialelor și exonerezi TOP Pep de orice răspundere care decurge din utilizarea abuzivă.',
      shp_h1: 'Politică de livrare', shp_intro: 'Această politică rezumă modul în care comenzile sunt expediate și livrate.',
      shp_s1h: 'Timpi de expediere', shp_s1p: 'Comenzile din stoc sunt expediate în 24–48 de ore de la confirmarea plății. Comenzile plasate înainte de ora-limită zilnică intră în pregătire în aceeași zi.',
      shp_s2h: 'Tarife &amp; livrare gratuită', shp_s2p: 'Livrarea standard cu urmărire este la tarif fix și gratuită pentru comenzile de peste 250 €. Opțiunile Express și Regatul Unit sunt disponibile la finalizarea comenzii.',
      shp_s3h: 'Ambalare', shp_s3p: 'Toate comenzile sunt expediate discret, fără nicio referire la produs pe exterior. Compușii ajung liofilizați și stabili la raft, sigilați împotriva luminii și umidității — nu este nevoie de lanț de frig.',
      shp_s4h: 'Urmărire', shp_s4p: 'Un link de urmărire îți este trimis pe e-mail când coletul este predat curierului. Timpii de tranzit variază în funcție de destinație și curier.',
      shp_s5h: 'Retururi', shp_s5p: 'Deoarece acestea sunt materiale de cercetare sensibile, nu putem accepta returul flacoanelor deschise. Contactează-ne în 7 zile dacă o comandă ajunge deteriorată sau greșită și o vom rezolva.',
      nav_impressum: 'Date legale', im_h1: 'Date legale',
      im_operator: 'Operatorul site-ului', im_address: 'Adresă sediu', im_email: 'E-mail',
      im_reg: 'Nr. înregistrare (Reg. Com.)', im_vat: 'Cod TVA (CUI)', im_responsible: 'Responsabil de conținut',
      im_onrequest: 'La cerere', im_note: 'Aceste date legale vor fi completate cu numărul de la Registrul Comerțului și codul TVA înainte de lansarea comercială.'
    }
  };
  var LOCALES = { en: 'en-GB', de: 'de-AT', ro: 'ro-RO' };
  var COUNTRIES = {
    de: { Austria:'Österreich', Belgium:'Belgien', Bulgaria:'Bulgarien', Croatia:'Kroatien', Cyprus:'Zypern', Czechia:'Tschechien', Denmark:'Dänemark', Estonia:'Estland', Finland:'Finnland', France:'Frankreich', Germany:'Deutschland', Greece:'Griechenland', Hungary:'Ungarn', Ireland:'Irland', Italy:'Italien', Latvia:'Lettland', Lithuania:'Litauen', Luxembourg:'Luxemburg', Malta:'Malta', Netherlands:'Niederlande', Poland:'Polen', Portugal:'Portugal', Romania:'Rumänien', Slovakia:'Slowakei', Slovenia:'Slowenien', Spain:'Spanien', Sweden:'Schweden', 'United Kingdom':'Vereinigtes Königreich' },
    ro: { Austria:'Austria', Belgium:'Belgia', Bulgaria:'Bulgaria', Croatia:'Croația', Cyprus:'Cipru', Czechia:'Cehia', Denmark:'Danemarca', Estonia:'Estonia', Finland:'Finlanda', France:'Franța', Germany:'Germania', Greece:'Grecia', Hungary:'Ungaria', Ireland:'Irlanda', Italy:'Italia', Latvia:'Letonia', Lithuania:'Lituania', Luxembourg:'Luxemburg', Malta:'Malta', Netherlands:'Țările de Jos', Poland:'Polonia', Portugal:'Portugalia', Romania:'România', Slovakia:'Slovacia', Slovenia:'Slovenia', Spain:'Spania', Sweden:'Suedia', 'United Kingdom':'Regatul Unit' }
  };
  var SKIP = { en: 'Skip to content', de: 'Zum Inhalt springen', ro: 'Sari la conținut' };
  /* per-page <title> (— TOP Pep is appended) + meta description */
  var PAGE_META = {
    home:     { t: { en: 'Research peptides, verified before they ship', de: 'Forschungspeptide, geprüft bevor sie versendet werden', ro: 'Peptide de cercetare, verificate înainte de expediere' }, d: { en: 'Third-party tested research peptides with a Certificate of Analysis on the product page. Discreet, tracked EU & UK shipping.', de: 'Drittanbieter-getestete Forschungspeptide mit Analysenzertifikat auf der Produktseite. Diskreter Versand mit Sendungsverfolgung in EU & UK.', ro: 'Peptide de cercetare testate de terți, cu certificat de analiză pe pagina produsului. Livrare discretă și urmărită în UE & Regatul Unit.' } },
    shop:     { t: { en: 'Catalog', de: 'Katalog', ro: 'Catalog' }, d: { en: 'Browse the full TOP Pep catalog of third-party tested research peptides, blends and lab supplies.', de: 'Durchstöbere den gesamten TOP-Pep-Katalog an drittanbieter-getesteten Forschungspeptiden, Mischungen und Laborbedarf.', ro: 'Răsfoiește întregul catalog TOP Pep de peptide de cercetare testate de terți, amestecuri și consumabile de laborator.' } },
    coa:      { t: { en: 'COA library', de: 'COA-Bibliothek', ro: 'Bibliotecă COA' }, d: { en: 'Public library of Janoshik Certificates of Analysis. Verify your vial against its lot number.', de: 'Öffentliche Bibliothek der Janoshik-Analysenzertifikate. Prüfe dein Vial anhand der Chargennummer.', ro: 'Bibliotecă publică de certificate de analiză Janoshik. Verifică-ți flaconul după numărul de lot.' } },
    quality:  { t: { en: 'Quality & testing', de: 'Qualität & Tests', ro: 'Calitate & testare' }, d: { en: 'Every TOP Pep batch is independently tested by Janoshik — HPLC purity, mass-spec identity, and a certificate you can verify.', de: 'Jede TOP-Pep-Charge wird von Janoshik unabhängig getestet — HPLC-Reinheit, MS-Identität und ein verifizierbares Zertifikat.', ro: 'Fiecare lot TOP Pep este testat independent de Janoshik — puritate HPLC, identitate prin spectrometrie de masă și un certificat verificabil.' } },
    shipping: { t: { en: 'Shipping', de: 'Versand', ro: 'Livrare' }, d: { en: 'Freeze-dried, sealed and shipped discreetly with tracking. Free over €250, delivery across the EU and UK.', de: 'Gefriergetrocknet, versiegelt und diskret mit Sendungsverfolgung versendet. Gratis ab 250 €, Lieferung in EU und UK.', ro: 'Liofilizat, sigilat și expediat discret cu urmărire. Gratuit peste 250 €, livrare în UE și Regatul Unit.' } },
    wholesale:{ t: { en: 'Wholesale', de: 'Großhandel', ro: 'Angro' }, d: { en: 'Standing wholesale accounts with fixed volume pricing, batch-level COAs and dispatch priority.', de: 'Feste Großhandelskonten mit fixen Volumenpreisen, Chargen-COAs und Versandpriorität.', ro: 'Conturi en-gros permanente cu prețuri fixe de volum, COA-uri per lot și prioritate la expediere.' } },
    partner:  { t: { en: 'Partner Program', de: 'Partnerprogramm', ro: 'Program parteneri' }, d: { en: 'Earn 20–40% tiered commission promoting third-party tested research peptides. Monthly PayPal payouts.', de: 'Verdiene 20–40 % gestaffelte Provision mit drittanbieter-getesteten Forschungspeptiden. Monatliche PayPal-Auszahlungen.', ro: 'Câștigă un comision de 20–40% promovând peptide de cercetare testate de terți. Plăți lunare prin PayPal.' } },
    contact:  { t: { en: 'Contact', de: 'Kontakt', ro: 'Contact' }, d: { en: 'Question about an order, a COA, or reconstitution? Contact the TOP Pep support team.', de: 'Frage zu einer Bestellung, einem COA oder zur Rekonstitution? Kontaktiere das TOP-Pep-Support-Team.', ro: 'Ai o întrebare despre o comandă, un COA sau reconstituire? Contactează echipa de asistență TOP Pep.' } },
    faq:      { t: { en: 'FAQ', de: 'FAQ', ro: 'Întrebări frecvente' }, d: { en: 'Answers on testing, COAs, storage, shipping, wholesale and support.', de: 'Antworten zu Tests, COAs, Lagerung, Versand, Großhandel und Support.', ro: 'Răspunsuri despre testare, COA-uri, depozitare, livrare, en-gros și asistență.' } },
    about:    { t: { en: 'About', de: 'Über uns', ro: 'Despre' }, d: { en: 'Why TOP Pep exists: documented, traceable research material in a market full of guesswork.', de: 'Warum es TOP Pep gibt: dokumentiertes, rückverfolgbares Forschungsmaterial in einem Markt voller Rätselraten.', ro: 'De ce există TOP Pep: material de cercetare documentat și trasabil, într-o piață plină de presupuneri.' } },
    cart:     { t: { en: 'Your cart', de: 'Dein Warenkorb', ro: 'Coșul tău' }, d: {} },
    checkout: { t: { en: 'Checkout', de: 'Kasse', ro: 'Finalizare comandă' }, d: {} },
    account:  { t: { en: 'Account', de: 'Konto', ro: 'Cont' }, d: {} },
    terms:    { t: { en: 'Terms & conditions', de: 'AGB', ro: 'Termeni & condiții' }, d: {} },
    privacy:  { t: { en: 'Privacy policy', de: 'Datenschutzerklärung', ro: 'Politică de confidențialitate' }, d: {} },
    'legal-agreement':  { t: { en: 'Research-use agreement', de: 'Forschungsnutzungs-Vereinbarung', ro: 'Acord de utilizare în cercetare' }, d: {} },
    'shipping-policy':  { t: { en: 'Shipping policy', de: 'Versandrichtlinie', ro: 'Politică de livrare' }, d: {} },
    impressum: { t: { en: 'Legal notice', de: 'Impressum', ro: 'Date legale' }, d: {} }
  };
  function applyPageMeta() {
    try { document.documentElement.lang = lang; } catch (e) {}
    var sk = $('.skip-link'); if (sk && SKIP[lang]) sk.textContent = SKIP[lang];
    var m = PAGE_META[page]; if (!m) return;
    if (m.t && m.t[lang]) document.title = m.t[lang] + ' — TOP Pep';
    var md = $('meta[name="description"]');
    if (md && m.d && m.d[lang]) md.setAttribute('content', m.d[lang]);
  }
  var lang = localStorage.getItem('toppep_lang') || 'en';
  if (!DICT[lang]) lang = 'en';
  function t(key) { return (DICT[lang] && DICT[lang][key]) || DICT.en[key] || key; }
  function setLang(l) { if (!DICT[l]) return; lang = l; localStorage.setItem('toppep_lang', l); location.reload(); }

  var NAV = [
    { label: 'Shop', href: '/shop/', page: 'shop' },
    { label: 'COA', href: '/coa/', page: 'coa' },
    { label: 'Quality', href: '/quality/', page: 'quality' },
    { label: 'Shipping', href: '/shipping/', page: 'shipping' },
    { label: 'Wholesale', href: '/wholesale/', page: 'wholesale' },
    { label: 'Partner Program', href: '/partner/', page: 'partner' },
    { label: 'Contact', href: '/contact/', page: 'contact' }
  ];
  var TICKS = [t('third_party'), t('free_shipping_over') + ' ' + money(T.freeShip), t('coa_per_lot'), t('same_day_dispatch')];

  /* =================================================================
     CART STATE
  ================================================================= */
  var Cart = {
    items: [],
    load: function () {
      try { this.items = JSON.parse(localStorage.getItem('toppep_cart') || '[]'); }
      catch (e) { this.items = []; }
    },
    save: function () { localStorage.setItem('toppep_cart', JSON.stringify(this.items)); emit(); },
    add: function (p, option, qty, isAuto) {
      qty = qty || 1;
      var price = option ? option.price : p.price;
      var ron = option ? option.ron : p.ron;
      var key = p.slug + (option ? '|' + option.label : '');
      var line = this.items.filter(function (i) { return i.key === key; })[0];
      if (line) { line.qty += qty; }
      else { this.items.push({ key: key, slug: p.slug, name: p.name, category: p.category, option: option ? option.label : '', price: price, ron: ron, img: p.img, qty: qty, auto: !!isAuto }); }
      this.save();
      // every peptide needs a diluent — auto-add Bacteriostatic Water 10ml (not for serum / lab supplies)
      if (!isAuto && p.category === 'Peptides' && p.slug !== 'bacteriostatic-water') {
        var bw = T.bacWater10();
        this.add(bw.product, bw.option, qty, true);
      }
    },
    setQty: function (key, qty) {
      var line = this.items.filter(function (i) { return i.key === key; })[0];
      if (!line) return;
      line.qty = qty;
      if (line.qty <= 0) this.items = this.items.filter(function (i) { return i.key !== key; });
      this.save();
    },
    remove: function (key) { this.items = this.items.filter(function (i) { return i.key !== key; }); this.save(); },
    count: function () { return this.items.reduce(function (n, i) { return n + i.qty; }, 0); },
    subtotal: function () { return this.items.reduce(function (n, i) { return n + lv(i) * i.qty; }, 0); },
    clear: function () { this.items = []; this.save(); }
  };
  var listeners = [];
  function emit() { listeners.forEach(function (fn) { fn(); }); }
  function onCart(fn) { listeners.push(fn); fn(); }

  /* =================================================================
     ORDERS — bank-transfer order records.
     Stored in localStorage (key toppep_orders) so the confirmation page
     and the /admin/ view can read them. When T.orderApiUrl is set
     (Phase 2), each order is also POSTed to the backend, which owns the
     real unique constraint and status. Payment refs are additionally
     de-duplicated locally against already-stored orders.
  ================================================================= */
  /* map a camelCase order to the snake_case body the Worker expects */
  function orderApiPayload(o) {
    return {
      order_no: o.orderNo, currency: o.currency, total: o.total, total_text: o.totalText,
      email: o.email, name: o.name, org: o.org, address: o.address, city: o.city,
      zip: o.zip, country: o.country, lang: o.lang, items: o.items,
      payment_method: o.paymentMethod || (o.status === 'cod' ? 'cod' : undefined)
    };
  }
  var Orders = {
    KEY: 'toppep_orders',
    all: function () { try { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); } catch (e) { return []; } },
    save: function (list) { localStorage.setItem(this.KEY, JSON.stringify(list)); },
    byRef: function (ref) { return this.all().filter(function (o) { return o.ref === ref; })[0]; },
    uniqueRef: function () {
      var ref, guard = 0;
      do { ref = T.genPaymentRef(); guard++; } while (this.byRef(ref) && guard < 50);
      return ref;
    },
    store: function (order) { var list = this.all(); list.unshift(order); this.save(list); return order; },
    add: function (order) {
      this.store(order);
      // Phase 2: hand the order to the backend if configured.
      if (T.orderApiUrl) {
        try {
          fetch(T.orderApiUrl + '/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderApiPayload(order))
          }).catch(function () {});
        } catch (e) {}
      }
      return order;
    },
    setStatus: function (ref, status) {
      var list = this.all(), hit = null;
      list.forEach(function (o) { if (o.ref === ref) { o.status = status; o.paidAt = status === 'paid' ? Date.now() : o.paidAt; hit = o; } });
      this.save(list);
      return hit;
    }
  };

  /* =================================================================
     CHROME MARKUP
  ================================================================= */
  var page = document.body.dataset.page || '';

  function tickerHTML() {
    // repeat the items enough that one half already exceeds even ultra-wide
    // screens (2560px+); each half also gets min-width:100% in CSS as a floor.
    var one = TICKS.map(function (t) { return '<span class="ticker-item">' + t + '</span>'; }).join('');
    var seq = '';
    for (var i = 0; i < 8; i++) seq += one;
    // two identical halves → translateX(-50%) loops seamlessly
    return '<div class="ticker" aria-hidden="true"><div class="ticker-track"><span class="ticker-seq">' + seq + '</span><span class="ticker-seq">' + seq + '</span></div></div>';
  }

  var FLAGS = { en: '🇬🇧', de: '🇩🇪', ro: '🇷🇴' };
  var LANGNAMES = { en: 'English', de: 'Deutsch', ro: 'Română' };
  function langMenuHTML() {
    var opts = ['en', 'de', 'ro'].map(function (l) {
      return '<button class="lang-opt' + (l === lang ? ' active' : '') + '" data-lang="' + l + '"><span class="flag">' + FLAGS[l] + '</span>' + LANGNAMES[l] + '</button>';
    }).join('');
    return '<div class="lang-switch"><button class="lang-btn" id="langBtn" aria-label="Language" aria-haspopup="true" aria-expanded="false"><span class="flag">' + FLAGS[lang] + '</span><span class="lang-code">' + lang.toUpperCase() + '</span></button>' +
      '<div class="lang-menu" id="langMenu">' + opts + '</div></div>';
  }
  function headerHTML() {
    var nav = NAV.map(function (n) {
      return '<a href="' + n.href + '"' + (n.page === page ? ' aria-current="page"' : '') + '>' + t('nav_' + n.page) + '</a>';
    }).join('');
    var mnav = NAV.map(function (n) { return '<a href="' + n.href + '">' + t('nav_' + n.page) + '</a>'; }).join('');
    return '' +
      '<header class="site-header"><div class="header-inner">' +
        '<a class="brand" href="/"><img src="/logo.png" alt="TOP Pep"></a>' +
        '<nav class="primary-nav" aria-label="Primary">' + nav + '</nav>' +
        '<div class="header-actions">' +
          langMenuHTML() +
          '<button class="icon-btn" id="openSearch" aria-label="Search">' + I.search + '</button>' +
          '<a class="icon-btn hide-mobile" href="/account/" aria-label="Account">' + I.user + '</a>' +
          '<button class="cart-pill" id="openCart" aria-label="Open cart">' + I.cart + '<span class="cart-meta"></span></button>' +
          '<button class="icon-btn menu-toggle" id="menuToggle" aria-label="Menu" aria-expanded="false" aria-controls="mobilePanel">' + I.menu + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="mobile-panel" id="mobilePanel"><nav aria-label="Mobile">' + mnav +
        '<a href="/about/">' + t('about') + '</a><a href="/faq/">' + t('faq') + '</a></nav>' +
        '<div class="panel-foot"><a class="btn btn-outline btn-block" href="/account/">' + t('sign_in') + '</a></div>' +
      '</div></header>';
  }

  function searchModalHTML() {
    return '' +
      '<div class="search-modal" id="searchModal" role="dialog" aria-modal="true" aria-label="Search">' +
        '<div class="search-panel">' +
          '<div class="search-top"><div class="search-top-inner">' + I.search +
            '<input class="search-input" id="searchInput" type="search" placeholder="' + t('search_ph') + '" autocomplete="off">' +
            '<button class="search-close" id="closeSearch">Esc</button>' +
          '</div></div>' +
          '<div class="search-body">' +
            '<h2 id="searchHeading">' + t('popular') + '</h2><div id="searchResults"></div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function drawerHTML() {
    return '' +
      '<div class="drawer-backdrop" id="drawerBackdrop"></div>' +
      '<aside class="cart-drawer" id="cartDrawer" role="dialog" aria-modal="true" aria-label="Cart">' +
        '<div class="drawer-head"><h2>' + t('your_cart') + '</h2><button class="drawer-close" id="closeCart" aria-label="Close cart">' + I.close + '</button></div>' +
        '<div class="ship-progress" id="shipProgress"></div>' +
        '<div class="drawer-items" id="drawerItems"></div>' +
        '<div class="drawer-foot" id="drawerFoot"></div>' +
      '</aside>';
  }

  function sizeSheetHTML() {
    return '' +
      '<div class="sheet-backdrop" id="sheetBackdrop"></div>' +
      '<div class="size-sheet" id="sizeSheet" role="dialog" aria-modal="true" aria-label="Choose size">' +
        '<div class="sheet-grip"></div>' +
        '<div class="sheet-head"><div class="sheet-thumb"></div>' +
          '<div class="sheet-title"><div class="st-name"></div><div class="st-price"></div></div>' +
          '<button class="sheet-close" id="sheetClose" aria-label="Close">' + I.close + '</button></div>' +
        '<div class="sheet-hint"></div>' +
        '<div class="sheet-options"></div>' +
      '</div>';
  }

  var LEGAL = {
    en: ['Terms', 'Privacy', 'Shipping', 'Legal agreement'],
    de: ['AGB', 'Datenschutz', 'Versand', 'Nutzungsvereinbarung'],
    ro: ['Termeni', 'Confidențialitate', 'Livrare', 'Acord legal']
  };
  function coaLightboxHTML() {
    return '' +
      '<div class="coa-lightbox" id="coaLightbox" role="dialog" aria-modal="true" aria-label="Certificate of Analysis">' +
        '<div class="coa-lb-panel">' +
          '<div class="coa-lb-head"><span class="coa-lb-title"></span><button class="coa-lb-close" id="coaLbClose" aria-label="Close">' + I.close + '</button></div>' +
          '<div class="coa-lb-tabs"></div>' +
          '<div class="coa-lb-img"></div>' +
          '<div class="coa-lb-foot"><a class="btn coa-lb-link" target="_blank" rel="noopener">' + t('coa_open_janoshik') + '</a></div>' +
        '</div>' +
      '</div>';
  }

  function openCoaLightbox(p, startIndex) {
    if (!p || !p.coa) return;
    var lb = $('#coaLightbox');
    var tests = p.coaAll || [p.coa];
    var tabsEl = $('.coa-lb-tabs', lb);
    function show(i) {
      var tst = tests[i];
      $('.coa-lb-title', lb).textContent = displayName(p) + (tst.size ? ' · ' + tst.size : '') + ' · Janoshik #' + tst.task;
      $('.coa-lb-img', lb).innerHTML = tst.img ? '<img src="' + T.imgUrl(tst.img) + '" alt="COA ' + esc(displayName(p)) + '">' : '';
      $('.coa-lb-link', lb).href = tst.url;
      $$('.coa-lb-tab', tabsEl).forEach(function (b, bi) { b.classList.toggle('active', bi === i); });
    }
    if (tests.length > 1) {
      tabsEl.innerHTML = tests.map(function (tst, i) { return '<button class="coa-lb-tab" data-i="' + i + '">' + esc(tst.size || ('Test ' + (i + 1))) + '</button>'; }).join('');
      tabsEl.style.display = 'flex';
      $$('.coa-lb-tab', tabsEl).forEach(function (b) { b.addEventListener('click', function () { show(parseInt(b.dataset.i, 10)); }); });
    } else {
      tabsEl.innerHTML = ''; tabsEl.style.display = 'none';
    }
    var startI = (typeof startIndex === 'number' && startIndex >= 0 && startIndex < tests.length) ? startIndex : tests.length - 1;
    show(startI);
    lb.classList.add('open'); document.body.classList.add('no-scroll');
  }
  function closeCoaLightbox() { $('#coaLightbox').classList.remove('open'); document.body.classList.remove('no-scroll'); }

  function footerHTML() {
    var lg = LEGAL[lang] || LEGAL.en;
    return '' +
      '<footer class="site-footer"><div class="wrap">' +
        '<div class="footer-cols">' +
          '<div class="f-brand-col"><div class="f-brand"><img src="/logo.png" alt="TOP Pep"></div>' +
            '<p class="footer-desc">' + t('footer_desc') + '</p>' +
            '<div class="footer-pills"><span class="footer-pill">' + t('third_party') + '</span><span class="footer-pill">EU &amp; UK</span></div></div>' +
          '<div><h3>' + t('f_catalog') + '</h3><ul><li><a href="/shop/">' + t('fl_all') + '</a></li><li><a href="/shop/">' + t('cat_peptides') + '</a></li><li><a href="/shop/">' + t('cat_topicals') + '</a></li><li><a href="/shop/">' + t('cat_labsupplies') + '</a></li><li><a href="/coa/">' + t('fl_coa') + '</a></li></ul></div>' +
          '<div><h3>' + t('f_company') + '</h3><ul><li><a href="/about/">' + t('about') + '</a></li><li><a href="/quality/">' + t('nav_quality') + '</a></li><li><a href="/wholesale/">' + t('nav_wholesale') + '</a></li><li><a href="/faq/">' + t('faq') + '</a></li></ul></div>' +
          '<div><h3>' + t('f_support') + '</h3><ul><li><a href="/contact/">' + t('nav_contact') + '</a></li><li><a href="/shipping/">' + t('nav_shipping') + '</a></li><li><a href="/shipping-policy/">' + lg[2] + '</a></li><li><a href="/faq/">' + t('faq') + '</a></li><li><a href="/account/">' + t('sign_in') + '</a></li></ul></div>' +
        '</div>' +
        '<p class="footer-disclaimer">' + t('disclaimer') + '</p>' +
        '<div class="footer-bottom"><span>© 2026 TOP Pep. ' + t('rights') + '</span><div class="legal-links">' +
          '<a href="/impressum/">' + t('nav_impressum') + '</a><a href="/terms/">' + lg[0] + '</a><a href="/privacy/">' + lg[1] + '</a><a href="/shipping-policy/">' + lg[2] + '</a><a href="/legal-agreement/">' + lg[3] + '</a>' +
        '</div></div>' +
      '</div></footer>';
  }

  /* =================================================================
     PRODUCT CARD (shared: carousels + shop grid)
  ================================================================= */
  function priceHTML(p) {
    if (p.type === 'variable') return T.priceLabel(p);
    if (p.oldPrice) return '<span class="old">' + money(lvOld(p)) + '</span> ' + money(lv(p));
    return money(lv(p));
  }
  function cornerBadge(p) {
    if (p.bestSeller) return '<span class="corner-badge badge-best">' + t('best_seller') + '</span>';
    if (p.onSale) return '<span class="corner-badge badge-sale">' + t('sale') + '</span>';
    return '';
  }
  function cardHTML(p) {
    var variable = p.type === 'variable';
    var addLabel = variable ? t('select_options') : t('add_to_cart');
    var addIcon = variable ? I.menu : I.plus;
    return '' +
      '<article class="product-card">' +
        '<a class="card-media" href="/product/?p=' + p.slug + '" aria-label="' + p.name + '">' +
          cornerBadge(p) +
          pimg(p) +
        '</a>' +
        '<div class="card-info">' +
          '<a class="c-name" href="/product/?p=' + p.slug + '">' + displayName(p) + '</a>' +
          '<div class="c-size">' + T.sizeLabel(p) + '</div>' +
          '<div class="c-price">' + priceHTML(p) + '</div>' +
          '<button class="card-add" data-add="' + p.slug + '">' + addIcon + '<span>' + addLabel + '</span></button>' +
        '</div>' +
      '</article>';
  }

  function wireCardAdds(root) {
    $$('[data-add]', root).forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var p = T.bySlug(btn.dataset.add);
        if (p.type === 'variable') { openSizeSheet(p); return; }
        Cart.add(p, null, 1);
        openDrawer();
      });
    });
  }

  /* ---- bottom-sheet size picker (variable products) ---- */
  function openSizeSheet(p) {
    var sheet = $('#sizeSheet');
    $('.sheet-thumb', sheet).innerHTML = pimg(p);
    $('.st-name', sheet).textContent = displayName(p);
    $('.st-price', sheet).innerHTML = T.priceLabel(p);
    $('.sheet-hint', sheet).textContent = t('tap_a_size');
    $('.sheet-options', sheet).innerHTML = p.options.map(function (o, i) {
      var so = T.isSoldOut(p.slug, o.label);
      var pr = so
        ? '<span class="so-soldout">' + t('sold_out') + '</span>'
        : (o.oldPrice ? '<span class="old">' + money(lvOld(o)) + '</span> ' : '') + '<b>' + money(lv(o)) + '</b>';
      return '<button class="sheet-opt' + (so ? ' is-sold-out' : '') + '" data-i="' + i + '"' +
        (so ? ' disabled aria-disabled="true"' : '') +
        '><span class="so-label">' + o.label + '</span><span class="so-price">' + pr + '</span>' +
        (so ? '' : '<span class="so-add">' + I.plus + '</span>') + '</button>';
    }).join('');
    $$('.sheet-opt', sheet).forEach(function (b) {
      b.addEventListener('click', function () {
        var o = p.options[parseInt(b.dataset.i, 10)];
        if (T.isSoldOut(p.slug, o.label)) return; // belt and braces
        Cart.add(p, o, 1);
        closeSizeSheet();
        openDrawer();
      });
    });
    $('#sheetBackdrop').classList.add('open');
    sheet.classList.add('open');
    document.body.classList.add('no-scroll');
  }
  function closeSizeSheet() {
    $('#sizeSheet').classList.remove('open');
    $('#sheetBackdrop').classList.remove('open');
    document.body.classList.remove('no-scroll');
  }

  /* =================================================================
     BUILD + WIRE CHROME
  ================================================================= */
  /* ---- 18+ age gate (first visit only) ---- */
  function ageGateHTML() {
    return '' +
      '<div class="age-gate" id="ageGate" role="dialog" aria-modal="true" aria-label="Age verification">' +
        '<div class="age-panel">' +
          '<img class="age-logo" src="/logo.png" alt="TOP Pep">' +
          '<span class="age-eyebrow">' + t('ag_eyebrow') + '</span>' +
          '<h2>' + t('ag_h') + '</h2>' +
          '<p>' + t('ag_p') + '</p>' +
          '<div class="age-actions">' +
            '<button class="btn" id="ageEnter">' + t('ag_enter') + '</button>' +
            '<button class="btn btn-outline" id="ageExit">' + t('ag_exit') + '</button>' +
          '</div>' +
          '<div class="age-foot">' + t('ag_foot') + '</div>' +
        '</div>' +
      '</div>';
  }

  function buildChrome() {
    document.body.insertAdjacentHTML('afterbegin', tickerHTML() + headerHTML() + searchModalHTML() + drawerHTML() + sizeSheetHTML() + coaLightboxHTML());
    document.body.insertAdjacentHTML('beforeend', footerHTML());

    // keep a constant, calm scroll speed (~28px/s) no matter how wide the
    // repeated content is — a fixed animation-duration would speed up
    // whenever the item list needs more repeats to cover very wide screens.
    (function tuneTickerSpeed() {
      var track = $('.ticker-track');
      var half = $('.ticker-seq', track);
      if (!track || !half) return;
      var TICKER_SPEED_PX_S = 28;
      var seconds = Math.round(half.getBoundingClientRect().width / TICKER_SPEED_PX_S);
      track.style.animationDuration = seconds + 's';
    })();

    // age gate on first visit
    if (!localStorage.getItem('toppep_age_ok')) {
      document.body.insertAdjacentHTML('beforeend', ageGateHTML());
      document.body.classList.add('no-scroll');
      $('#ageEnter').addEventListener('click', function () {
        localStorage.setItem('toppep_age_ok', '1');
        var g = $('#ageGate'); if (g) g.remove();
        document.body.classList.remove('no-scroll');
      });
      $('#ageExit').addEventListener('click', function () { location.href = 'https://www.google.com'; });
    }

    // language switcher
    var langBtn = $('#langBtn'), langMenu = $('#langMenu');
    langBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = langMenu.classList.toggle('open');
      langBtn.setAttribute('aria-expanded', String(open));
    });
    $$('.lang-opt').forEach(function (b) { b.addEventListener('click', function () { setLang(b.dataset.lang); }); });
    document.addEventListener('click', function () { langMenu.classList.remove('open'); });

    // translate any static markup tagged with data-i18n / data-i18n-ph
    $$('[data-i18n]').forEach(function (el) { var v = t(el.getAttribute('data-i18n')); if (v) el.innerHTML = v; });
    $$('[data-i18n-ph]').forEach(function (el) { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
    if (lang !== 'en' && COUNTRIES[lang]) $$('[data-country]').forEach(function (el) { var c = COUNTRIES[lang][el.getAttribute('data-country')]; if (c) el.textContent = c; });
    applyPageMeta();

    // size sheet
    $('#sheetClose').addEventListener('click', closeSizeSheet);
    $('#sheetBackdrop').addEventListener('click', closeSizeSheet);

    // COA lightbox
    $('#coaLbClose').addEventListener('click', closeCoaLightbox);
    $('#coaLightbox').addEventListener('click', function (e) { if (e.target === this) closeCoaLightbox(); });

    // cart pill
    var pill = $('#openCart');
    onCart(function () {
      var c = Cart.count();
      pill.classList.toggle('filled', c > 0);
      $('.cart-meta', pill).innerHTML = c > 0 ? ('<span class="cart-count">' + c + '</span><span class="cart-sum"> · ' + money(Cart.subtotal()) + '</span>') : '';
      pill.setAttribute('aria-label', 'Open cart, ' + c + ' items');
    });
    pill.addEventListener('click', openDrawer);
    pill.addEventListener('cart:bump', function () {});

    // drawer
    $('#closeCart').addEventListener('click', closeDrawer);
    $('#drawerBackdrop').addEventListener('click', closeDrawer);
    onCart(renderDrawer);

    // search
    $('#openSearch').addEventListener('click', openSearch);
    $('#closeSearch').addEventListener('click', closeSearch);
    $('#searchInput').addEventListener('input', function () { renderSearch(this.value); });
    $('#searchModal').addEventListener('click', function (e) { if (e.target === this) closeSearch(); });

    // mobile panel
    var mt = $('#menuToggle'), mp = $('#mobilePanel');
    mt.addEventListener('click', function () {
      var open = mp.classList.toggle('open');
      mt.setAttribute('aria-expanded', String(open));
    });

    // newsletter (removed from footer)
    var nlForm = $('#newsletterForm');
    if (nlForm) nlForm.addEventListener('submit', function (e) {
      e.preventDefault();
      this.innerHTML = '<p style="color:var(--text-primary);font-size:14px;">' + t('nl_done') + '</p>';
    });

    // global escape
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if ($('#coaLightbox').classList.contains('open')) closeCoaLightbox();
      else if ($('#sizeSheet').classList.contains('open')) closeSizeSheet();
      else if ($('#searchModal').classList.contains('open')) closeSearch();
      else if ($('#cartDrawer').classList.contains('open')) closeDrawer();
      else if (mp.classList.contains('open')) { mp.classList.remove('open'); mt.setAttribute('aria-expanded', 'false'); }
    });
  }

  function openDrawer() { $('#cartDrawer').classList.add('open'); $('#drawerBackdrop').classList.add('open'); document.body.classList.add('no-scroll'); pillBump(); }
  function closeDrawer() { $('#cartDrawer').classList.remove('open'); $('#drawerBackdrop').classList.remove('open'); document.body.classList.remove('no-scroll'); }
  function pillBump() { var p = $('#openCart'); p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump'); }

  function renderDrawer() {
    var items = Cart.items, box = $('#drawerItems'), foot = $('#drawerFoot'), ship = $('#shipProgress');
    if (!items.length) {
      ship.style.display = 'none';
      box.innerHTML = '<div class="drawer-empty">' + I.cart + '<p>' + t('cart_empty') + '</p><a class="btn btn-block" href="/shop/">' + t('browse') + '</a></div>';
      foot.innerHTML = '';
      return;
    }
    ship.style.display = '';
    var sub = Cart.subtotal(), thr = T.freeShip, pct = Math.min(sub / thr, 1) * 100;
    var msg = sub >= thr ? t('free_ship_unlocked') : money(thr - sub) + ' ' + t('away_free');
    ship.innerHTML = '<div class="ship-msg">' + msg + '</div><div class="ship-track"><div class="ship-fill" style="width:' + pct + '%"></div><span class="ship-dot"></span></div>';
    box.innerHTML = items.map(function (i) {
      return '<div class="drawer-line"><div class="thumb">' + pimgLine(i) + '</div><div>' +
        '<div class="dl-name">' + lineName(i) + (i.option ? ' · ' + i.option : '') + '</div>' +
        '<div class="dl-cat">' + (i.auto ? t('added_recon') : t('cat_' + T.strip(i.category))) + '</div>' +
        '<div class="dl-row"><div class="stepper" data-key="' + i.key + '"><button data-step="-1" aria-label="Decrease">–</button><span class="qty">' + i.qty + '</span><button data-step="1" aria-label="Increase">+</button></div>' +
        '<span class="dl-price">' + money(lv(i) * i.qty) + '</span></div>' +
        '<button class="dl-remove" data-remove="' + i.key + '">' + t('remove') + '</button>' +
      '</div></div>';
    }).join('');
    foot.innerHTML = '<div class="drawer-subtotal"><span class="label">' + t('subtotal') + '</span><span class="amt">' + money(sub) + '</span></div>' +
      '<a class="btn btn-block" href="/checkout/">' + t('checkout') + '</a>' +
      '<p class="drawer-note">' + t('ships_taxes') + '</p>';
    wireQtyControls(box);
  }

  function wireQtyControls(root) {
    $$('.stepper', root).forEach(function (st) {
      var key = st.dataset.key;
      $$('button', st).forEach(function (b) {
        b.addEventListener('click', function () {
          var line = Cart.items.filter(function (i) { return i.key === key; })[0];
          if (line) Cart.setQty(key, line.qty + parseInt(b.dataset.step, 10));
        });
      });
    });
    $$('[data-remove]', root).forEach(function (b) {
      b.addEventListener('click', function () { Cart.remove(b.dataset.remove); });
    });
  }

  /* ---- search ---- */
  function openSearch() { $('#searchModal').classList.add('open'); document.body.classList.add('no-scroll'); renderSearch(''); setTimeout(function () { $('#searchInput').focus(); }, 30); }
  function closeSearch() { $('#searchModal').classList.remove('open'); document.body.classList.remove('no-scroll'); }
  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    if (!m) return n; if (!n) return m;
    for (i = 0; i <= m; i++) d[i] = [i];
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return d[m][n];
  }
  function searchScore(p, qn) {
    var hay = [p.name, p.full, p.category, p.group, p.lot].concat(p.aliases || []).map(T.strip);
    var best = 99;
    for (var i = 0; i < hay.length; i++) {
      var h = hay[i]; if (!h) continue;
      if (h === qn) return 0;
      if (h.indexOf(qn) > -1) best = Math.min(best, 0.5);
      else if (qn.length >= 4 && qn.indexOf(h) > -1) best = Math.min(best, 0.8);
      else {
        var tol = qn.length <= 5 ? 1 : (qn.length <= 8 ? 2 : 3);
        var dist = lev(qn, h);
        if (dist <= tol) best = Math.min(best, 0.4 + dist * 0.4);
        // weaker match against a prefix of a longer name
        if (h.length > qn.length) { var pd = lev(qn, h.slice(0, qn.length)); if (pd <= tol) best = Math.min(best, 1 + pd * 0.3); }
      }
    }
    return best;
  }
  function searchList(q) {
    var qn = T.strip((q || '').trim());
    if (!qn) return T.featured.map(function (s) { return T.bySlug(s); });
    return T.products.map(function (p) { return { p: p, s: searchScore(p, qn) }; })
      .filter(function (x) { return x.s < 3; })
      .sort(function (a, b) { return a.s - b.s || a.p.order - b.p.order; })
      .map(function (x) { return x.p; });
  }
  function resultRow(p) {
    return '<button class="search-result" onclick="location.href=\'/product/?p=' + p.slug + '\'">' +
      '<span class="thumb">' + pimg(p) + '</span>' +
      '<span><span class="r-name">' + displayName(p) + '</span></span>' +
      '<span class="r-cat">' + t('cat_' + T.strip(p.category)) + '</span>' +
      '<span class="r-price">' + T.priceLabel(p) + '</span>' +
      '<span class="r-arrow">' + I.arrow + '</span>' +
    '</button>';
  }
  function renderSearch(q) {
    q = (q || '').trim();
    var list = searchList(q), box = $('#searchResults');
    $('#searchHeading').textContent = q ? (list.length + ' ' + t('results')) : t('popular');
    box.innerHTML = list.length ? list.slice(0, 8).map(resultRow).join('') : '<p class="search-empty">' + t('no_results') + ' “' + q + '”.</p>';
  }

  /* =================================================================
     PER-PAGE INITIALISERS
  ================================================================= */
  var Pages = {
    home: function () {
      $$('[data-carousel]').forEach(function (car) {
        var key = car.dataset.carousel;
        var items = key === 'featured'
          ? T.featured.map(function (s) { return T.bySlug(s); })
          : T.products.filter(function (p) { return p.group === key; });
        car.innerHTML = items.map(cardHTML).join('');
        wireCardAdds(car);
      });
      initFaqAccordion();

      // bottom search on home: hand the query to the shop grid
      var ss = $('#stickySearch');
      if (ss) ss.classList.add('visible');
      var ssInput = $('#stickySearchInput');
      if (ssInput) {
        ssInput.setAttribute('placeholder', t('search_lot_ph'));
        var go = function () {
          var v = ssInput.value.trim();
          location.href = '/shop/' + (v ? '?q=' + encodeURIComponent(v) : '');
        };
        ssInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
        ssInput.addEventListener('search', function () { if (ssInput.value.trim()) go(); });
      }
    },

    shop: function () {
      var grid = $('#shopGrid'), state = { cat: 'All', sale: false, sort: 'order', q: '' };
      var qParam = new URLSearchParams(location.search).get('q');
      if (qParam) state.q = qParam.trim();
      function render() {
        var list = T.products.filter(function (p) {
          if (state.cat !== 'All' && p.category !== state.cat) return false;
          if (state.sale && !p.onSale) return false;
          return true;
        });
        if (state.q) {
          var qn = T.strip(state.q); // live bottom search: plain contains on name + lot (+ full/aliases)
          list = list.filter(function (p) {
            var hay = [p.name, p.full, p.lot].concat(p.aliases || []).map(T.strip).join('|');
            return hay.indexOf(qn) > -1;
          }).sort(function (a, b) { return a.order - b.order; });
        } else {
          if (state.sort === 'order') list.sort(function (a, b) { return a.order - b.order; });
          if (state.sort === 'price-asc') list.sort(function (a, b) { return T.priceOf(a) - T.priceOf(b); });
          if (state.sort === 'price-desc') list.sort(function (a, b) { return T.priceOf(b) - T.priceOf(a); });
          if (state.sort === 'name') list.sort(function (a, b) { return a.name.localeCompare(b.name); });
        }
        $('#shopCount').textContent = list.length + ' / ' + T.products.length;
        grid.innerHTML = list.length ? list.map(cardHTML).join('') : '';
        $('#shopEmpty').style.display = list.length ? 'none' : 'block';
        wireCardAdds(grid);
      }
      $$('.pills .pill').forEach(function (pill) {
        pill.addEventListener('click', function () {
          $$('.pills .pill').forEach(function (p) { p.setAttribute('aria-pressed', 'false'); });
          pill.setAttribute('aria-pressed', 'true');
          state.cat = pill.dataset.cat; render();
        });
        pill.textContent = pill.dataset.cat === 'All' ? t('all') : t('cat_' + T.strip(pill.dataset.cat));
      });
      var saleT = $('#saleToggle');
      if (saleT) saleT.addEventListener('click', function () {
        var on = saleT.getAttribute('aria-pressed') !== 'true';
        saleT.setAttribute('aria-pressed', String(on));
        state.sale = on; render();
      });
      var saleLbl = $('#saleToggleLabel'); if (saleLbl) saleLbl.textContent = t('on_sale');
      $('#sortSelect').addEventListener('change', function () { state.sort = this.value; render(); });
      render();

      // floating live bottom search — always visible, filters the grid live (name + lot)
      var ss = $('#stickySearch');
      if (ss) ss.classList.add('visible');
      var ssInput = $('#stickySearchInput');
      if (ssInput) {
        ssInput.setAttribute('placeholder', t('search_lot_ph'));
        if (state.q) ssInput.value = state.q;
        var deb;
        ssInput.addEventListener('input', function () {
          var v = this.value.trim();
          clearTimeout(deb);
          deb = setTimeout(function () { state.q = v; render(); }, 200);
        });
      }
    },

    product: function () {
      var params = new URLSearchParams(location.search);
      var p = T.bySlug(params.get('p')) || T.products[0];
      renderProduct(p);
    },

    cart: function () { renderCartPage(); onCart(renderCartPage); },

    checkout: function () {
      var params = new URLSearchParams(location.search);
      var stripe = params.get('stripe');
      if (stripe === 'success') { showStripePaid(params.get('ref')); return; }
      renderCheckout();
      if (stripe === 'cancel') {
        var note = $('#placeOrderNote');
        if (note) { note.style.color = '#e0533d'; note.textContent = t('pay_cancel_note'); }
      }
    },

    account: function () {
      var params = new URLSearchParams(location.search);
      if (params.get('mode') === 'register') switchAuth('register');
      $$('.auth-tab').forEach(function (t) { t.addEventListener('click', function () { switchAuth(t.dataset.mode); }); });
      $('#authForm').addEventListener('submit', function (e) { e.preventDefault(); $('#authStatus').textContent = t('acc_demo'); });
    },

    coa: function () {
      var list = T.coas.slice().sort(function (a, b) { return (b.coa ? 1 : 0) - (a.coa ? 1 : 0) || a.order - b.order; });
      var cnt = $('#coaCount'); if (cnt) cnt.textContent = '';
      $('#coaGrid').innerHTML = list.map(function (p) {
        if (p.coa) {
          var tests = p.coaAll || [p.coa];
          var sel = tests.length - 1; // default to the last (largest) size shown
          var img = tests[sel].img ? T.imgUrl(tests[sel].img) : '';
          var sizes = tests.length > 1
            ? '<div class="coa-sizes">' + tests.map(function (tst, i) {
                return '<button type="button" class="coa-size' + (i === sel ? ' active' : '') + '" data-i="' + i + '">' + esc(tst.size || ('#' + (i + 1))) + '</button>';
              }).join('') + '</div>'
            : '';
          return '<article class="coa-card verified" data-slug="' + p.slug + '" data-sel="' + sel + '" tabindex="0" role="button" aria-label="' + esc(displayName(p)) + ' — Janoshik #' + p.coa.task + '">' +
            '<div class="coa-frame">' + (img ? '<img class="coa-cert" src="' + img + '" alt="COA ' + esc(displayName(p)) + '">' : I.doc) + '</div>' +
            sizes +
            '<div class="coa-name">' + displayName(p) + '</div></article>';
        }
        return '<article class="coa-card pending">' +
          '<div class="coa-frame"><img class="coa-cert blur" src="' + T.imgUrl(T.janoshikBlur) + '" alt="" aria-hidden="true">' +
            '<span class="coa-soon">' + I.flask + t('coa_coming_soon') + '</span></div>' +
          '<div class="coa-name">' + displayName(p) + '</div></article>';
      }).join('');
      $$('.coa-card.verified').forEach(function (card) {
        var p = list.filter(function (x) { return x.slug === card.dataset.slug; })[0];
        var tests = p.coaAll || [p.coa];
        var open = function () { openCoaLightbox(p, parseInt(card.dataset.sel, 10) || 0); };
        card.addEventListener('click', open);
        card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
        // size chips: swap the preview image without opening the lightbox
        $$('.coa-size', card).forEach(function (chip) {
          chip.addEventListener('click', function (e) {
            e.stopPropagation();
            var i = parseInt(chip.dataset.i, 10);
            card.dataset.sel = i;
            $$('.coa-size', card).forEach(function (x) { x.classList.remove('active'); });
            chip.classList.add('active');
            var cert = $('.coa-cert', card);
            if (cert && tests[i].img) cert.src = T.imgUrl(tests[i].img);
          });
        });
      });
      var filter = $('#coaSearch');
      if (filter) filter.addEventListener('input', function () {
        var q = this.value.trim().toLowerCase();
        $$('.coa-card').forEach(function (card) {
          card.style.display = (!q || card.textContent.toLowerCase().indexOf(q) > -1) ? '' : 'none';
        });
      });
    },

    faq: function () { initFaqAccordion(); },

    wholesale: function () {
      wireMailForm({
        form: '#wholesaleForm', status: '#wfStatus', to: 'wholesale@top-pep.com', subject: 'Wholesale request — top-pep.com',
        required: [['wfFirst', false], ['wfLast', false], ['wfEmail', true], ['wfMessage', false]],
        collect: function () {
          return {
            'First name': $('#wfFirst').value.trim(), 'Last name': $('#wfLast').value.trim(),
            'Email': $('#wfEmail').value.trim(), 'Company': $('#wfCompany').value.trim(),
            'Phone': $('#wfPhone').value.trim(), 'Message': $('#wfMessage').value.trim()
          };
        },
        okMsg: t('form_ok_wholesale')
      });
    },

    partner: function () {
      wireMailForm({
        form: '#partnerForm', status: '#pfStatus', to: 'affiliate@top-pep.com', subject: 'Partner application — top-pep.com',
        required: [['pfFirst', false], ['pfLast', false], ['pfEmail', true]],
        collect: function () {
          return {
            'First name': $('#pfFirst').value.trim(), 'Last name': $('#pfLast').value.trim(),
            'Email': $('#pfEmail').value.trim(), 'Channel': $('#pfChannel').value.trim(), 'Message': $('#pfMessage').value.trim()
          };
        },
        okMsg: t('form_ok_partner')
      });
    },

    contact: function () {
      wireMailForm({
        form: '#contactForm', status: '#cfStatus', to: 'support@top-pep.com', subject: 'Support request — top-pep.com',
        required: [['cfName', false], ['cfEmail', true], ['cfMessage', false]],
        collect: function () {
          return {
            'Name': $('#cfName').value.trim(), 'Email': $('#cfEmail').value.trim(),
            'Order number': $('#cfOrder').value.trim(), 'Message': $('#cfMessage').value.trim()
          };
        },
        okMsg: t('form_ok_contact')
      });
    }
  };

  /* ---- shared form → email sender ----
     Posts through formsubmit.co so submissions land in the inbox;
     falls back to a prefilled mailto: draft if the request is blocked. */
  function wireMailForm(cfg) {
    var form = $(cfg.form);
    if (!form) return;
    var emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = true;
      cfg.required.forEach(function (c) {
        var el = $('#' + c[0]);
        var bad = !el.value.trim() || (c[1] && !emailRe.test(el.value.trim()));
        el.classList.toggle('wf-error', bad);
        if (bad) ok = false;
      });
      var status = $(cfg.status);
      if (!ok) { status.style.color = '#e0533d'; status.textContent = t('form_invalid'); return; }
      var data = cfg.collect();
      status.style.color = '';
      status.textContent = t('form_sending');
      var payload = { _subject: cfg.subject };
      Object.keys(data).forEach(function (k) { payload[k] = data[k]; });
      fetch('https://formsubmit.co/ajax/' + cfg.to, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (r) { if (!r.ok) throw new Error('send failed'); return r.json(); })
        .then(function () { form.reset(); status.textContent = cfg.okMsg; })
        .catch(function () {
          var body = Object.keys(data).map(function (k) { return k + ': ' + data[k]; }).join('\n');
          location.href = 'mailto:' + cfg.to + '?subject=' + encodeURIComponent(cfg.subject) + '&body=' + encodeURIComponent(body);
          status.textContent = cfg.okMsg;
        });
    });
  }

  /* ---- product detail render ---- */
  function getShipInfo() {
    var now = new Date();
    var cutoff = 14; // 14:00 — after this the Austrian post is effectively closed for same-day handover
    var day = now.getDay();
    var shipsToday = day >= 1 && day <= 5 && now.getHours() < cutoff;
    var ship = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (!shipsToday) { do { ship.setDate(ship.getDate() + 1); } while (ship.getDay() === 0 || ship.getDay() === 6); }
    var deliver = new Date(ship), added = 0;
    while (added < 2) { deliver.setDate(deliver.getDate() + 1); if (deliver.getDay() !== 0 && deliver.getDay() !== 6) added++; }
    return { shipsToday: shipsToday, deliver: deliver };
  }
  function fmtDate(d) {
    try { return new Intl.DateTimeFormat(LOCALES[lang] || 'en-GB', { day: 'numeric', month: 'long' }).format(d); }
    catch (e) { return d.toDateString(); }
  }

  function renderProduct(p) {
    document.title = p.name + ' — TOP Pep';
    var root = $('#productRoot');
    var isVar = p.type === 'variable';
    // never preselect a sold-out size (bac water 3 ml is options[0])
    var firstBuyable = isVar
      ? p.options.findIndex(function (o) { return !T.isSoldOut(p.slug, o.label); })
      : -1;
    var selected = (isVar && firstBuyable > -1) ? p.options[firstBuyable] : null;
    var qty = 1;
    var ship = getShipInfo();

    var topPrice = isVar ? T.priceLabel(p) : ((p.oldPrice ? '<span class="old">' + money(lvOld(p)) + '</span> ' : '') + '<span class="cur">' + money(lv(p)) + '</span>');
    // which sizes are actually stocked — named next to "in stock · ships today"
    var stockedSizes = isVar
      ? p.options.filter(function (o) { return !T.isPreorder(p.slug, o.label) && !T.isSoldOut(p.slug, o.label); })
                 .map(function (o) { return o.label; })
      : [];
    var anyStock = isVar ? stockedSizes.length > 0 : !T.isPreorder(p.slug, null) && !T.isSoldOut(p.slug, null);
    // only claim "in stock · ships today" when something really is in stock,
    // and name exactly what is stocked, e.g. "· GLP-3 RT 10 mg"
    var stockedWhat = anyStock
      ? displayName(p) + (stockedSizes.length ? ' ' + stockedSizes.join(', ') : '')
      : '';
    var shipStatus = anyStock
      ? (ship.shipsToday ? t('in_stock_today') : t('ships_next')) + ' · ' + esc(stockedWhat)
      : '';

    root.innerHTML = '' +
      '<div class="pd">' +
        '<div class="pd-media">' +
          '<div class="main-img">' + pimg(p) + '</div>' +
        '</div>' +
        '<div class="pd-info">' +
          '<span class="eyebrow">' + t('cat_' + T.strip(p.category)) + ' · ' + t('research_only') + '</span>' +
          '<h1>' + displayName(p) + '</h1>' +
          '<div class="pd-price">' + topPrice + '</div>' +
          '<p class="pd-desc">' + blurbText(p) + '</p>' +
          (isVar ?
            '<div class="pd-options">' +
              '<div class="pd-select-head"><span class="opt-label">' + t('select_size') + '</span><button class="pd-clear" id="pdClear">' + t('clear') + '</button></div>' +
              '<div class="swatches">' + p.options.map(function (o, i) {
                var so = T.isSoldOut(p.slug, o.label);
                var pre = T.isPreorder(p.slug, o.label);
                // label sits ABOVE the bubble, not inside it; only stocked
                // sizes get a promise, sold-out ones a warning, the rest none
                var state = so ? '<span class="sw-state sw-out">' + t('sold_out') + '</span>'
                          : pre ? '<span class="sw-state sw-none"></span>'
                                : '<span class="sw-state sw-in">' + t('ship_24h') + '</span>';
                return '<div class="swatch-wrap">' + state +
                  '<button class="swatch' + (so ? ' is-sold-out' : '') + '" data-i="' + i + '"' +
                  (so ? ' disabled aria-disabled="true"' : '') +
                  ' aria-pressed="' + (i === firstBuyable && !so) + '">' + o.label + '</button></div>';
              }).join('') + '</div>' +
            '</div>' +
            '<div class="pd-sel-price" id="pdSelPrice"></div>' : '') +
          '<div id="pdPreorder"></div>' +
          '<div class="pd-buy-simple">' +
            '<div class="stepper pd-stepper-lg"><button data-pstep="-1" aria-label="-">–</button><span class="qty pd-qty">1</span><button data-pstep="1" aria-label="+">+</button></div>' +
            '<button class="btn btn-block" id="pdAdd">' + t('add_to_cart') + '</button>' +
          '</div>' +
          '<div class="pd-cats">' + t('categories') + ': <a href="/shop/">' + t('cat_' + T.strip(p.category)) + '</a>, <a href="/shop/">' + groupLabel(p) + '</a></div>' +
          '<div class="pd-ship">' +
            (shipStatus ? '<div class="ship-line">' + I.clock + '<span>' + shipStatus + '</span></div>' : '') +
            '<div class="ship-line">' + I.truck + '<span>' + t('two_day') + ' <b>' + fmtDate(ship.deliver) + '</b></span></div>' +
          '</div>' +
          '<div class="spec-grid">' +
            '<div class="cell"><div class="k">' + t('purity') + '</div><div class="v">' + p.purity + '</div></div>' +
            '<div class="cell"><div class="k">' + t('form') + '</div><div class="v">' + (lang === 'en' ? p.form.replace(' powder', '').replace(' blend', '') : formLabel(p)) + '</div></div>' +
            '<div class="cell"><div class="k">' + t('dispatch') + '</div><div class="v">' + (ship.shipsToday ? t('same_day') : t('next_business_day')) + '</div></div>' +
          '</div>' +
          '<ul class="trust-checks">' +
            '<li>' + I.check + t('third_party') + '</li>' +
            '<li>' + I.check + t('coa_per_lot') + '</li>' +
            '<li>' + I.check + (ship.shipsToday ? t('same_day_dispatch') : t('next_day_dispatch')) + '</li>' +
            '<li>' + I.check + t('free_shipping_over') + ' ' + money(T.freeShip) + '</li>' +
          '</ul>' +
        '</div>' +
      '</div>' +
      tabsHTML(p);

    var selPrice = $('#pdSelPrice', root);
    var addBtn = $('#pdAdd', root);

    /* pre-order notice follows the chosen size (10 mg may ship now while
       15 mg is pre-order); for a size-less product it just reflects the product */
    function syncPreorder() {
      var box = $('#pdPreorder', root);
      if (!box) return;
      var label = isVar ? (selected && selected.label) : null;
      var slug = p.slug;
      if (isVar && !selected) { box.innerHTML = ''; return; }
      // no pre-order text on the product page any more — the "may need
      // reordering" wording lives at checkout. Only sold-out still speaks up.
      box.innerHTML = T.isSoldOut(slug, label)
        ? '<div class="sold-out-note">' + t('sold_out_note') + '</div>' : '';
    }

    function syncSel() {
      syncPreorder();
      // a size-less product that is sold out can't be bought either
      if (!isVar) {
        if (T.isSoldOut(p.slug, null)) { addBtn.disabled = true; addBtn.textContent = t('sold_out'); }
        return;
      }
      var soldOut = selected && T.isSoldOut(p.slug, selected.label);
      if (selected && !soldOut) {
        selPrice.innerHTML = (selected.oldPrice ? '<span class="old" style="font-size:16px;color:var(--text-secondary);text-decoration:line-through;margin-right:8px;">' + money(lvOld(selected)) + '</span>' : '') + money(lv(selected));
        addBtn.disabled = false;
        addBtn.textContent = t('add_to_cart');
      } else {
        selPrice.textContent = '';
        addBtn.disabled = true;
        addBtn.textContent = soldOut ? t('sold_out') : t('add_to_cart');
      }
      // swap the main product photo to match the chosen size
      var mainImg = $('.main-img', root);
      if (mainImg) mainImg.innerHTML = '<img src="' + T.imgUrl((selected && selected.img) || p.img) + '" alt="' + esc(displayName(p)) + '" loading="lazy">';
      var sb = $('#sbPrice'); if (sb) sb.textContent = selected ? money(lv(selected)) : '—';
    }
    syncSel();

    // swatches + clear
    if (isVar) {
      $$('.swatch', root).forEach(function (sw) {
        sw.addEventListener('click', function () {
          $$('.swatch', root).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
          sw.setAttribute('aria-pressed', 'true');
          selected = p.options[parseInt(sw.dataset.i, 10)];
          syncSel();
        });
      });
      $('#pdClear', root).addEventListener('click', function () {
        $$('.swatch', root).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        selected = null; syncSel();
      });
    }
    // stepper
    var qtyEl = $('.pd-qty', root);
    $$('[data-pstep]', root).forEach(function (b) {
      b.addEventListener('click', function () { qty = Math.max(1, Math.min(99, qty + parseInt(b.dataset.pstep, 10))); qtyEl.textContent = qty; });
    });
    addBtn.addEventListener('click', function () {
      if (isVar && !selected) return;
      Cart.add(p, selected, qty); openDrawer();
    });
    // tabs
    $$('.tab-nav button', root).forEach(function (b) {
      b.addEventListener('click', function () {
        $$('.tab-nav button', root).forEach(function (x) { x.setAttribute('aria-selected', 'false'); });
        $$('.tab-panel', root).forEach(function (x) { x.classList.remove('active'); });
        b.setAttribute('aria-selected', 'true');
        $('[data-panel="' + b.dataset.tab + '"]', root).classList.add('active');
      });
    });

    // sticky mobile buy bar
    var sticky = $('#stickyBuy');
    sticky.innerHTML = '<div class="sb-left"><div class="thumb">' + pimg(p) + '</div><div><div class="sb-name">' + displayName(p) + '</div><div class="sb-price" id="sbPrice">' + (isVar ? money(lv(selected)) : money(lv(p))) + '</div></div></div>' +
      '<button class="btn" id="sbAdd">' + t('add_to_cart') + '</button>';
    $('#sbAdd').addEventListener('click', function () { if (isVar && !selected) return; Cart.add(p, selected, qty); openDrawer(); });
    var info = $('.pd-info', root);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (e) {
        sticky.classList.toggle('visible', e[0].boundingClientRect.bottom < window.innerHeight * 0.4 && window.innerWidth <= 900);
      }, { threshold: 0 }).observe(info);
    }

    function tabsHTML(p) {
      var coaLine = p.coa
        ? t('tab_coa_tested').replace('{task}', p.coa.task).replace('{url}', p.coa.url)
        : t('tab_coa_testing');
      var fl = formLabel(p);
      if (lang === 'en') fl = fl.toLowerCase();
      else if (lang === 'ro') fl = fl.charAt(0).toLowerCase() + fl.slice(1);
      var detailsBody = t('tab_details_body').replace('{form}', fl);
      return '<div class="pd-tabs"><div class="tab-nav" role="tablist">' +
        '<button role="tab" data-tab="desc" aria-selected="true">' + t('description') + '</button>' +
        '<button role="tab" data-tab="details" aria-selected="false">' + t('details') + '</button>' +
        '<button role="tab" data-tab="specs" aria-selected="false">' + t('specifications') + '</button>' +
        '</div>' +
        '<div class="tab-panel active" data-panel="desc"><p>' + blurbText(p) + ' ' + coaLine + '</p></div>' +
        '<div class="tab-panel" data-panel="details"><p>' + detailsBody + '</p></div>' +
        '<div class="tab-panel" data-panel="specs"><dl><dt>' + t('purity') + '</dt><dd>' + p.purity + '</dd><dt>' + t('form') + '</dt><dd>' + formLabel(p) + '</dd><dt>' + t('spec_storage') + '</dt><dd>' + t('spec_storage_val') + '</dd><dt>COA</dt><dd>' + (p.coa ? 'Janoshik #' + p.coa.task : t('spec_coa_testing')) + '</dd><dt>' + t('spec_use') + '</dt><dd>' + t('spec_use_val') + '</dd></dl></div>' +
      '</div>';
    }
  }

  /* ---- cart page render ---- */
  function renderCartPage() {
    var root = $('#cartRoot');
    if (!Cart.items.length) {
      root.innerHTML = '<div class="cart-empty">' + I.cart + '<h1>' + t('cart_empty') + '</h1><p>' + t('cart_empty_sub') + '</p><a class="btn" href="/shop/">' + t('browse') + '</a></div>';
      return;
    }
    var rows = Cart.items.map(function (i) {
      return '<tr class="cart-row"><td><div class="cart-prod"><div class="thumb">' + pimgLine(i) + '</div><div>' +
        '<div class="cp-name">' + lineName(i) + (i.option ? ' · ' + i.option : '') + '</div><div class="cp-cat">' + (i.auto ? t('added_recon') : t('cat_' + T.strip(i.category))) + '</div></div></div></td>' +
        '<td><div class="stepper" data-key="' + i.key + '"><button data-step="-1" aria-label="Decrease">–</button><span class="qty">' + i.qty + '</span><button data-step="1" aria-label="Increase">+</button></div></td>' +
        '<td class="right">' + money(lv(i)) + '</td>' +
        '<td class="right"><strong>' + money(lv(i) * i.qty) + '</strong><br><button class="dl-remove" data-remove="' + i.key + '">' + t('remove') + '</button></td></tr>';
    }).join('');
    var sub = Cart.subtotal();
    var ship = sub >= T.freeShip ? 0 : T.shipCost;
    root.innerHTML = '<h1 style="margin-bottom:8px;">' + t('your_cart') + '</h1>' +
      '<div class="cart-layout"><div><table class="cart-table"><thead><tr><th>' + t('product') + '</th><th>' + t('qty') + '</th><th class="right">' + t('price') + '</th><th class="right">' + t('total') + '</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<aside class="cart-summary"><h2>' + t('order_summary') + '</h2>' +
        '<div class="sum-row"><span class="muted">' + t('subtotal') + '</span><span>' + money(sub) + '</span></div>' +
        '<div class="sum-row"><span class="muted">' + t('shipping_word') + '</span><span>' + (ship ? money(ship) : t('free_word')) + '</span></div>' +
        '<div class="sum-row total"><span>' + t('total') + '</span><span>' + money(sub + ship) + '</span></div>' +
        '<a class="btn btn-block" href="/checkout/" style="margin-top:16px;">' + t('proceed_checkout') + '</a>' +
        '<a class="link-arrow" href="/shop/" style="margin-top:18px;display:inline-flex;">' + t('continue_shopping') + ' ' + I.arrow + '</a>' +
      '</aside></div>';
    wireQtyControls(root);
  }

  /* ---- checkout render ---- */
  var INS_COST = CUR === 'ron' ? 25.99 : 4.99;
  /* ---- postal-code formats per country (checkout address validation) ---- */
  var POSTAL = {
    Austria: /^\d{4}$/, Belgium: /^\d{4}$/, Bulgaria: /^\d{4}$/, Croatia: /^\d{5}$/,
    Cyprus: /^\d{4}$/, Czechia: /^\d{3} ?\d{2}$/, Denmark: /^\d{4}$/, Estonia: /^\d{5}$/,
    Finland: /^\d{5}$/, France: /^\d{5}$/, Germany: /^\d{5}$/, Greece: /^\d{3} ?\d{2}$/,
    Hungary: /^\d{4}$/, Ireland: /^[A-Za-z]\d{2} ?[A-Za-z0-9]{4}$/, Italy: /^\d{5}$/,
    Latvia: /^(LV-)?\d{4}$/i, Lithuania: /^(LT-)?\d{5}$/i, Luxembourg: /^(L-)?\d{4}$/i,
    Malta: /^[A-Za-z]{3} ?\d{4}$/, Netherlands: /^\d{4} ?[A-Za-z]{2}$/, Poland: /^\d{2}-?\d{3}$/,
    Portugal: /^\d{4}-?\d{3}$/, Romania: /^\d{6}$/, Slovakia: /^\d{3} ?\d{2}$/,
    Slovenia: /^(SI-)?\d{4}$/i, Spain: /^\d{5}$/, Sweden: /^\d{3} ?\d{2}$/,
    Switzerland: /^\d{4}$/,
    'United Kingdom': /^[A-Za-z]{1,2}\d[A-Za-z\d]? ?\d[A-Za-z]{2}$/
  };
  /* human-readable expected format, for the error message */
  var POSTAL_HINT = {
    Austria: '4', Belgium: '4', Bulgaria: '4', Cyprus: '4', Denmark: '4', Hungary: '4',
    Latvia: '4', Luxembourg: '4', Slovenia: '4', Switzerland: '4',
    Croatia: '5', Estonia: '5', Finland: '5', France: '5', Germany: '5', Italy: '5',
    Lithuania: '5', Spain: '5', Romania: '6'
  };

  function selectedCountry() {
    var sel = $('#coCountry');
    if (!sel) return '';
    var opt = sel.options[sel.selectedIndex];
    return (opt && opt.getAttribute('data-country')) || sel.value || '';
  }

  /* ISO-2 codes for the zippopotam.us postcode↔city lookup */
  var ISO2 = {
    Austria: 'at', Belgium: 'be', Bulgaria: 'bg', Croatia: 'hr', Cyprus: 'cy', Czechia: 'cz',
    Denmark: 'dk', Estonia: 'ee', Finland: 'fi', France: 'fr', Germany: 'de', Greece: 'gr',
    Hungary: 'hu', Ireland: 'ie', Italy: 'it', Latvia: 'lv', Lithuania: 'lt', Luxembourg: 'lu',
    Malta: 'mt', Netherlands: 'nl', Poland: 'pl', Portugal: 'pt', Romania: 'ro', Slovakia: 'sk',
    Slovenia: 'si', Spain: 'es', Sweden: 'se', Switzerland: 'ch', 'United Kingdom': 'gb'
  };

  /* a house number must contain a digit; 12, 12a, 12/3, 12-14 all count */
  var HOUSE_RE = /\d/;

  /* ---- per-field error / warning messages under the input ---- */
  function fieldMsg(id, cls, html) {
    var el = $('#' + id); if (!el) return;
    var box = el.closest('.field') || el.parentNode;
    var old = box.querySelector('.field-err, .field-warn, .field-checking');
    if (old) old.remove();
    el.classList.toggle('wf-error', cls === 'field-err');
    if (!html) return;
    var p = document.createElement('p');
    p.className = cls;
    p.innerHTML = html;
    box.appendChild(p);
  }
  function clearFieldMsg(id) { fieldMsg(id, '', ''); }

  /* ---- zip ↔ city cross-check via zippopotam.us (free, no key) ----
     Warns only: a network failure or unknown postcode must never block an
     order, so every failure path resolves to "no complaint". */
  var zipCheckCache = {};
  function normalise(s) {
    return (s || '').toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }
  function lookupZipCity(country, zip) {
    var iso = ISO2[country];
    if (!iso) return Promise.resolve(null); // country we can't look up → skip
    var key = iso + '/' + zip;
    if (zipCheckCache[key]) return Promise.resolve(zipCheckCache[key]);
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 4000);
    return fetch('https://api.zippopotam.us/' + iso + '/' + encodeURIComponent(zip),
                 ctrl ? { signal: ctrl.signal } : {})
      .then(function (r) {
        clearTimeout(timer);
        if (r.status === 404) return { unknown: true };
        if (!r.ok) return null;               // API hiccup → don't complain
        return r.json().then(function (d) {
          return { places: (d.places || []).map(function (p) { return p['place name']; }) };
        });
      })
      .then(function (res) { if (res) zipCheckCache[key] = res; return res; })
      .catch(function () { clearTimeout(timer); return null; }); // offline → don't block
  }

  /* "Postal code for Germany must be 5 digits." — falls back to the generic
     message for countries whose format isn't a plain digit count (NL, UK…). */
  function zipFormatMsg(country) {
    var n = POSTAL_HINT[country];
    if (!n) return t('err_zip');
    // use the label the customer actually sees ("Deutschland", not "Germany")
    var sel = $('#coCountry');
    var shown = (sel && sel.options[sel.selectedIndex] && sel.options[sel.selectedIndex].textContent.trim()) || country;
    return t('err_zip_fmt').replace('{country}', shown).replace('{n}', n);
  }

  /* ---- blur validation on the address fields ---- */
  function wireAddressValidation() {
    var form = $('#coZip') && $('#coZip').form;
    if (!form || form.dataset.addrWired) return;
    form.dataset.addrWired = '1';

    var house = $('#coHouse');
    if (house) house.addEventListener('blur', function () {
      var v = house.value.trim();
      if (!v) return fieldMsg('coHouse', 'field-err', t('err_house_req'));
      if (!HOUSE_RE.test(v)) return fieldMsg('coHouse', 'field-err', t('err_house'));
      clearFieldMsg('coHouse');
    });

    function zipBlur() {
      var zip = ($('#coZip').value || '').trim();
      var country = selectedCountry();
      if (!zip) return;
      if (POSTAL[country] && !POSTAL[country].test(zip)) {
        return fieldMsg('coZip', 'field-err', zipFormatMsg(country));
      }
      clearFieldMsg('coZip');
      if (!($('#coCity').value || '').trim()) return;
      fieldMsg('coZip', 'field-checking', t('zip_checking'));
      checkZipCity().then(function (warn) {
        if (warn) showZipWarning(warn); else clearFieldMsg('coZip');
      });
    }
    ['coZip', 'coCity'].forEach(function (id) {
      var el = $('#' + id); if (!el) return;
      el.addEventListener('blur', zipBlur);
      // typing clears a stale complaint immediately
      el.addEventListener('input', function () { addressWarnAccepted = false; clearFieldMsg(id); });
    });
    var c = $('#coCountry');
    if (c) c.addEventListener('change', function () { addressWarnAccepted = false; clearFieldMsg('coZip'); zipBlur(); });
  }

  /* zip↔city mismatch only warns — the customer can insist and carry on */
  var addressWarnAccepted = false;
  function showZipWarning(warn) {
    fieldMsg('coZip', 'field-warn', warn + '<button type="button" id="zipAnyway">' + t('zip_use_anyway') + '</button>');
    var b = $('#zipAnyway');
    if (b) b.addEventListener('click', function () {
      addressWarnAccepted = true;
      clearFieldMsg('coZip');
    });
  }

  /* Returns a promise: '' = fine, otherwise a warning string. */
  function checkZipCity() {
    var country = selectedCountry(), zip = ($('#coZip') || {}).value, city = ($('#coCity') || {}).value;
    zip = (zip || '').trim(); city = (city || '').trim();
    if (!zip || !city || !POSTAL[country] || !POSTAL[country].test(zip)) return Promise.resolve('');
    return lookupZipCity(country, zip).then(function (res) {
      if (!res) return '';                                   // unreachable → silent
      if (res.unknown) return t('warn_zip_unknown').replace('{zip}', esc(zip));
      var want = normalise(city);
      var hit = res.places.some(function (p) {
        var n = normalise(p);
        return n.indexOf(want) > -1 || want.indexOf(n) > -1; // "Wien" vs "Wien, Innere Stadt"
      });
      if (hit) return '';
      return t('warn_zip_city').replace('{zip}', esc(zip)).replace('{city}', esc(res.places[0] || ''));
    });
  }

  /* ---- validate the checkout form + build the order object (shared) ----
     Returns the order, or null when validation fails (and flags the fields). */
  function buildCheckoutOrder(sub, ship, ins) {
    if (!Cart.items.length) return null;
    var emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    var country = selectedCountry();
    var val = function (id) { var el = $('#' + id); return el ? el.value.trim() : ''; };
    var firstBad = null, msg = '';

    function flag(id, bad, message) {
      var el = $('#' + id); if (!el) return;
      if (bad) {
        fieldMsg(id, 'field-err', message || t('form_invalid'));
        if (!firstBad) { firstBad = el; msg = message || t('form_invalid'); }
      } else {
        clearFieldMsg(id);
      }
    }

    // required fields (house number is mandatory)
    ['coEmail', 'coFirst', 'coLast', 'coAddr', 'coHouse', 'coCity', 'coZip'].forEach(function (id) {
      flag(id, !val(id), id === 'coHouse' ? t('err_house_req') : t('form_invalid'));
    });
    // email format
    if (val('coEmail')) flag('coEmail', !emailRe.test(val('coEmail')), t('form_invalid'));
    // house number must contain a digit ("12", "12a", "12/3", "12-14")
    if (val('coHouse')) flag('coHouse', !HOUSE_RE.test(val('coHouse')), t('err_house'));
    // postal code must match the selected country's format
    if (val('coZip') && POSTAL[country]) {
      flag('coZip', !POSTAL[country].test(val('coZip')), zipFormatMsg(country));
    }
    // phone is optional — invalid only when filled in AND malformed (always
    // call flag() so clearing the field also clears a stale error mark)
    flag('coPhone', !!val('coPhone') && !/^\+?[\d\s()\/.-]{6,20}$/.test(val('coPhone')), t('err_phone'));

    var note = $('#placeOrderNote');
    if (firstBad) {
      if (note) { note.style.color = '#e0533d'; note.textContent = msg; }
      firstBad.focus();
      return null;
    }
    if (note) note.textContent = '';
    var total = sub + ship + ins;
    return {
      ref: Orders.uniqueRef(),
      orderNo: 'TP' + String(Date.now()).slice(-8),
      status: 'pending',
      createdAt: Date.now(),
      lang: lang,
      currency: CUR,
      email: val('coEmail'),
      name: (val('coFirst') + ' ' + val('coLast')).trim(),
      org: val('coOrg'),
      phone: val('coPhone'),
      address: (val('coAddr') + ' ' + val('coHouse')).trim(),
      city: val('coCity'),
      zip: val('coZip'),
      country: country,
      items: Cart.items.map(function (i) { return { name: lineName(i) + (i.option ? ' · ' + i.option : ''), qty: i.qty, price: lv(i), slug: i.slug, option: i.option || '', inStock: T.inStock(i.slug, i.option) }; }),
      subtotal: sub, shipping: ship, insurance: ins, total: total,
      totalText: money(total)
    };
  }
  /* cash-on-delivery is offered only to Romania and only when the whole basket
     ships in 24h — checked here at checkout, and again server-side. */
  function cartAllInStock() { return Cart.items.length > 0 && Cart.items.every(function (i) { return T.inStock(i.slug, i.option); }); }
  function isRomania() { return selectedCountry() === 'Romania'; }

  /* =================================================================
     STRIPE — embedded card payment (Payment Element, no redirect).
     The card fields render on this page inside Stripe's secure element;
     raw card data goes straight to Stripe and never touches our code.
  ================================================================= */
  var stripeJs = null, stripeElements = null, stripeMounted = false;
  var coMethod = 'card'; // 'card' | 'cod' — selected payment method at checkout

  function stripeReady() {
    return !!(window.Stripe && T.stripePublishableKey && T.orderApiUrl);
  }
  function ensureStripe() {
    // locale drives the Payment Element UI *and* Stripe's own error messages
    // (card declined, incorrect CVC, …) — shown in the customer's language.
    if (!stripeJs && stripeReady()) stripeJs = Stripe(T.stripePublishableKey, { locale: lang });
    return stripeJs;
  }
  /* current order total in the smallest currency unit (cents / bani) */
  function checkoutCents() {
    var sub = Cart.subtotal();
    var ship = sub >= T.freeShip ? 0 : T.shipCost;
    var insEl = $('#shipInsurance');
    var ins = insEl && insEl.checked ? INS_COST : 0;
    return Math.round((sub + ship + ins) * 100);
  }
  function mountPaymentElement() {
    if (stripeMounted || !ensureStripe()) return;
    if (!document.getElementById('payment-element')) return;
    var cents = checkoutCents();
    if (cents < 1) return; // nothing to charge yet
    stripeElements = stripeJs.elements({
      // Automatic payment methods: the Element and the server-side
      // PaymentIntent must agree. The server uses
      // automatic_payment_methods:{enabled:true, allow_redirects:'never'},
      // so no paymentMethodTypes here (specifying both is what triggered the
      // "collected through automatic payment methods … cannot be confirmed"
      // error). allow_redirects:'never' on the intent already drops Revolut Pay
      // / EPS / Satispay / MB WAY; wallets are switched off just below.
      mode: 'payment', amount: cents, currency: CUR,
      appearance: { theme: 'stripe', variables: { colorPrimary: '#5E17EB', borderRadius: '10px' } }
    });
    stripeElements.create('payment', {
      layout: 'tabs',
      terms: { card: 'never' },
      // card entry only — no wallets at all
      wallets: { applePay: 'never', googlePay: 'never', link: 'never' }
    }).mount('#payment-element');
    stripeMounted = true;
  }
  function updateStripeAmount() {
    if (!stripeElements) return;
    var cents = checkoutCents();
    if (cents >= 1) stripeElements.update({ amount: cents });
  }

  /* ---- submit gate: local checks must pass; the zip↔city check only warns,
     and the customer can override it with "use address anyway" ---- */
  function placeCardOrder(sub, ship, ins) {
    var order = buildCheckoutOrder(sub, ship, ins);
    if (!order) return; // house number / zip format / required fields block here
    if (addressWarnAccepted) return payWithCard(order);

    var btn = $('#placeOrder'), note = $('#placeOrderNote');
    if (btn) btn.disabled = true;
    if (note) { note.style.color = ''; note.textContent = t('zip_checking'); }
    checkZipCity().then(function (warn) {
      if (btn) btn.disabled = false;
      if (note) note.textContent = '';
      if (warn) {                       // warn once, let them insist
        showZipWarning(warn);
        var z = $('#coZip'); if (z) z.scrollIntoView({ block: 'center' });
        return;
      }
      payWithCard(order);
    });
  }

  /* ---- pay by card, in place via the Payment Element ---- */
  function payWithCard(order) {
    var note = $('#placeOrderNote');
    var errEl = $('#card-errors');
    var btn = $('#placeOrder');
    function fail(msg) {
      if (btn) btn.disabled = false;
      if (note) note.textContent = '';
      if (errEl) { errEl.style.color = '#e0533d'; errEl.textContent = msg || t('pay_card_error'); }
    }
    if (!stripeJs || !stripeElements) { fail(t('pay_card_error')); return; }
    if (btn) btn.disabled = true;
    if (errEl) errEl.textContent = '';
    if (note) { note.style.color = ''; note.textContent = t('pay_processing'); }

    var serverRef = null;
    stripeElements.submit().then(function (r) {
      if (r.error) throw r.error;
      var payload = {
        ref: order.ref,
        order_no: order.orderNo, currency: order.currency, total: order.total,
        total_text: order.totalText, email: order.email, name: order.name, org: order.org,
        address: order.address, city: order.city, zip: order.zip, country: order.country,
        lang: order.lang, items: order.items,
        shipping: order.shipping, insurance: order.insurance,
        shipping_label: t('shipping_word'), insurance_label: t('ship_protect')
      };
      return fetch(T.orderApiUrl + '/stripe/payment-intent', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (resp) { return resp.json(); });
    }).then(function (res) {
      if (!res || !res.clientSecret) throw new Error((res && res.error) || 'no client secret');
      serverRef = res.ref;
      order.ref = res.ref;
      // store as pending so the success page can still email even if a 3DS
      // step forces a redirect back to return_url
      Orders.add(order);
      return stripeJs.confirmPayment({
        elements: stripeElements,
        clientSecret: res.clientSecret,
        confirmParams: { return_url: location.origin + '/checkout/?stripe=success&ref=' + res.ref },
        redirect: 'if_required'
      });
    }).then(function (result) {
      if (result.error) throw result.error;
      showStripePaid(serverRef); // succeeded in place, no redirect
    }).catch(function (err) {
      fail(err && err.message);
    });
  }

  /* ---- email the new order to the internal order inbox ----
     opts.status / opts.subjectTag let the card flow reuse this with a
     different label (default = bank transfer, pending). */
  function emailOrderToInbox(order, opts) {
    opts = opts || {};
    var status = opts.status || 'PENDING — awaiting bank transfer';
    var subjectTag = opts.subjectTag || 'pending';
    var lines = order.items.map(function (i) { return i.qty + '× ' + i.name + ' — ' + money(i.price * i.qty); }).join('\n');
    var payload = {
      _subject: 'NEW ORDER ' + order.ref + ' — ' + order.totalText + ' (' + subjectTag + ')',
      'Payment reference': order.ref,
      'Order number': order.orderNo,
      'Status': status,
      'Total': order.totalText,
      'Customer': order.name,
      'Email': order.email,
      'Phone': order.phone || '—',
      'Institution': order.org,
      'Address': order.address + ', ' + order.zip + ' ' + order.city + ', ' + order.country,
      'Items': lines,
      'Language': order.lang
    };
    try {
      fetch('https://formsubmit.co/ajax/' + T.orderInbox, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(function () {});
    } catch (e) {}
  }

  /* ---- "Payment received" view after returning from Stripe ---- */
  function showStripePaid(ref) {
    Cart.clear();
    if (ref) {
      Orders.setStatus(ref, 'paid');
      // notify the order inbox with the full shipping details (Stripe's
      // dashboard has the payment but not the delivery address)
      var paidOrder = Orders.byRef(ref);
      if (paidOrder && !paidOrder._notified) {
        emailOrderToInbox(paidOrder, { status: 'PAID via card (Stripe) — ready to ship', subjectTag: 'PAID card' });
        paidOrder._notified = true;
        Orders.save(Orders.all().map(function (o) { return o.ref === ref ? paidOrder : o; }));
      }
    }
    var main = $('#main');
    if (!main) return;
    document.title = t('pay_paid_title') + ' — TOP Pep';
    main.innerHTML = '<div class="wrap"><div class="pay-confirm">' +
      '<span class="pay-eyebrow">' + t('pay_paid_title') + '</span>' +
      '<h1>' + t('pay_paid_title') + '</h1>' +
      '<p class="pay-intro">' + t('pay_paid_intro') + '</p>' +
      (ref ? '<div class="pay-meta"><span>' + t('pay_reference') + ': <b>' + esc(ref) + '</b></span></div>' : '') +
      '<div class="pay-actions"><a class="btn" href="/">' + t('pay_back_home') + '</a><a class="btn btn-outline" href="/faq/">' + t('pay_view_faq') + '</a></div>' +
    '</div></div>';
    window.scrollTo(0, 0);
    var ss = $('#stickySearch'); if (ss) ss.style.display = 'none';
  }

  /* ---- payment-method chooser (card / cash-on-delivery) ---- */
  function renderPaymentMethods(sub, ship, ins) {
    var host = $('#payMethods');
    if (!host) return;
    var ro = isRomania();
    var codOk = ro && cartAllInStock();
    // COD is not shown at all outside Romania; inside Romania it always shows
    // but is disabled (with a hint) when the basket isn't all in stock.
    if (!ro && coMethod === 'cod') coMethod = 'card';
    if (ro && coMethod === 'cod' && !codOk) coMethod = 'card';

    var cardCard =
      '<label class="pay-opt' + (coMethod === 'card' ? ' selected' : '') + '" data-method="card">' +
        '<input type="radio" name="payMethod" ' + (coMethod === 'card' ? 'checked' : '') + '>' +
        '<div class="pay-opt-body"><div class="pay-opt-title">' + t('pay_card_label') + '</div><div class="pay-opt-sub">' + t('pay_card_sub') + '</div></div>' +
      '</label>';
    var codCard = ro ?
      '<label class="pay-opt' + (coMethod === 'cod' ? ' selected' : '') + (codOk ? '' : ' disabled') + '" data-method="cod"' + (codOk ? '' : ' aria-disabled="true"') + '>' +
        '<input type="radio" name="payMethod" ' + (coMethod === 'cod' ? 'checked' : '') + (codOk ? '' : ' disabled') + '>' +
        '<div class="pay-opt-body"><div class="pay-opt-title">' + t('pay_cod') + '</div><div class="pay-opt-sub">' + t('pay_cod_sub') + '</div>' +
          (codOk ? '' : '<div class="pay-opt-hint">' + t('pay_cod_hint') + '</div>') +
        '</div></label>' : '';

    host.innerHTML = '<div class="pay-choose-label">' + t('pay_choose') + '</div>' + cardCard + codCard;
    $$('.pay-opt', host).forEach(function (opt) {
      if (opt.classList.contains('disabled')) return;
      opt.addEventListener('click', function () {
        coMethod = opt.getAttribute('data-method');
        renderPaymentMethods(sub, ship, ins);
        applyPayMethod(sub, ship, ins);
      });
    });
    applyPayMethod(sub, ship, ins);
  }
  function applyPayMethod(sub, ship, ins) {
    var pane = $('#cardPane');
    var btn = $('#placeOrder');
    if (coMethod === 'cod') {
      if (pane) pane.style.display = 'none';
      if (btn) { btn.textContent = t('place_order_cod'); btn.onclick = function () { placeCodOrder(sub, ship, ins); }; }
    } else {
      if (pane) pane.style.display = '';
      if (stripeReady()) { mountPaymentElement(); updateStripeAmount(); }
      if (btn) { btn.textContent = t('place_order_card'); btn.onclick = function () { placeCardOrder(sub, ship, ins); }; }
    }
  }

  /* ---- place a cash-on-delivery order (Romania, all in stock) ---- */
  function placeCodOrder(sub, ship, ins) {
    // re-check the rules here (belt) — the server checks again (braces)
    if (!isRomania() || !cartAllInStock()) {
      var note = $('#placeOrderNote');
      if (note) { note.style.color = '#e0533d'; note.textContent = t('pay_cod_hint'); }
      coMethod = 'card'; renderPaymentMethods(sub, ship, ins);
      return;
    }
    var order = buildCheckoutOrder(sub, ship, ins);
    if (!order) return; // required-field / format checks block here
    order.paymentMethod = 'cod';
    order.status = 'cod';

    var note = $('#placeOrderNote');
    var btn = $('#placeOrder');
    function finish() {
      Orders.store(order); // already POSTed below, so store locally only
      emailOrderToInbox(order, { status: 'CASH ON DELIVERY — collect ' + order.totalText + ' from courier', subjectTag: 'COD' });
      Cart.clear();
      showCodConfirmation(order);
    }
    // Ask the server to authorise the COD order. A 400 is a hard veto (wrong
    // country / an item not in stock) — we surface it and stop. Any other
    // outcome (server up + ok, or unreachable) falls back to the email record,
    // since the front-end already enforced the same rules.
    if (T.orderApiUrl) {
      if (btn) btn.disabled = true;
      if (note) { note.style.color = ''; note.textContent = t('pay_processing'); }
      fetch(T.orderApiUrl + '/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(orderApiPayload(order))
      }).then(function (r) {
        if (r.status === 400) { return r.json().then(function (j) { throw { veto: true, msg: (j && j.error) || t('pay_cod_hint') }; }); }
        return null; // ok or non-veto error → proceed
      }).then(function () {
        if (btn) btn.disabled = false;
        if (note) note.textContent = '';
        finish();
      }).catch(function (e) {
        if (btn) btn.disabled = false;
        if (e && e.veto) {
          if (note) { note.style.color = '#e0533d'; note.textContent = t('pay_cod_hint'); }
          coMethod = 'card'; renderPaymentMethods(sub, ship, ins);
        } else {
          if (note) note.textContent = '';
          finish(); // network error → don't block a valid order
        }
      });
    } else {
      finish();
    }
  }

  /* ---- "pay on delivery" confirmation view ---- */
  function showCodConfirmation(order) {
    var main = $('#main');
    if (!main) return;
    document.title = t('cod_confirm_title') + ' — TOP Pep';
    main.innerHTML = '<div class="wrap"><div class="pay-confirm">' +
      '<span class="pay-eyebrow">' + t('cod_status') + '</span>' +
      '<h1>' + t('cod_confirm_title') + '</h1>' +
      '<p class="pay-intro">' + t('cod_confirm_intro') + '</p>' +
      '<div class="pay-card">' +
        '<div class="pay-row"><div class="pay-row-label">' + t('cod_amount_due') + '</div><div class="pay-row-val"><span class="pay-val">' + esc(order.totalText) + '</span></div></div>' +
        '<div class="pay-row"><div class="pay-row-label">' + t('pay_order_no') + '</div><div class="pay-row-val"><span class="pay-val">' + esc(order.orderNo) + '</span></div></div>' +
      '</div>' +
      '<div class="pay-actions"><a class="btn" href="/">' + t('pay_back_home') + '</a><a class="btn btn-outline" href="/faq/">' + t('pay_view_faq') + '</a></div>' +
    '</div></div>';
    window.scrollTo(0, 0);
    var ss = $('#stickySearch'); if (ss) ss.style.display = 'none';
  }

  function renderCheckout() {
    var sub = Cart.subtotal();
    var os = $('#orderSummary');
    var ship = sub >= T.freeShip ? 0 : T.shipCost;
    var insEl = $('#shipInsurance');
    var ins = insEl && insEl.checked ? INS_COST : 0;
    var hasPreorder = Cart.items.some(function (i) { return T.isPreorder(i.slug, i.option); });
    if (os) {
      os.innerHTML = '<h2>' + t('order_summary') + '</h2>' +
        (hasPreorder ? '<div class="preorder-note">' + t('lowstock_note') + '</div>' : '') +
        (Cart.items.length ? Cart.items.map(function (i) {
          return '<div class="os-line"><div class="thumb">' + pimgLine(i) + '</div><div><div class="os-name">' + lineName(i) + (i.option ? ' · ' + i.option : '') + '</div><div class="os-qty">' + t('qty') + ' ' + i.qty + '</div>' +
            '</div><div class="os-price">' + money(lv(i) * i.qty) + '</div></div>';
        }).join('') : '<p class="text-muted" style="padding:12px 0;">' + t('cart_empty') + '.</p>') +
        '<div class="sum-row" style="margin-top:10px;"><span class="muted">' + t('subtotal') + '</span><span>' + money(sub) + '</span></div>' +
        '<div class="sum-row"><span class="muted">' + t('shipping_word') + '</span><span id="osShip">' + (ship ? money(ship) : t('free_word')) + '</span></div>' +
        (ins ? '<div class="sum-row"><span class="muted">' + t('ship_protect') + '</span><span>' + money(ins) + '</span></div>' : '') +
        '<div class="sum-row total"><span>' + t('total') + '</span><span>' + money(sub + ship + ins) + '</span></div>' +
        '<button class="btn btn-block" style="margin-top:16px;" id="placeOrder">' + t('place_order_card') + '</button>' +
        // stays empty until there's something worth saying (status / error)
        '<p class="drawer-note" id="placeOrderNote" style="margin-top:12px;"></p>';
    }
    wireAddressValidation();
    // render the payment-method chooser; it owns the button handler and mounts
    // the Stripe fields when card is selected
    renderPaymentMethods(sub, ship, ins);
    // re-evaluate cash-on-delivery whenever the delivery country changes
    var coCountry = $('#coCountry');
    if (coCountry && !coCountry.dataset.codWired) {
      coCountry.dataset.codWired = '1';
      coCountry.addEventListener('change', function () { renderPaymentMethods(Cart.subtotal(), Cart.subtotal() >= T.freeShip ? 0 : T.shipCost, ($('#shipInsurance') && $('#shipInsurance').checked) ? INS_COST : 0); });
    }
    var insPrice = $('#insPrice');
    if (insPrice) insPrice.textContent = money(INS_COST);
    if (insEl && !insEl.dataset.wired) {
      insEl.dataset.wired = '1';
      insEl.addEventListener('change', function () {
        insEl.closest('.insurance-card').classList.toggle('selected', insEl.checked);
        renderCheckout();
      });
    }
    // radio cards (the insurance checkbox card toggles itself — skip it here)
    $$('.radio-card').forEach(function (rc) {
      if (!rc.dataset.group) return;
      rc.addEventListener('click', function () {
        var group = rc.dataset.group;
        $$('.radio-card[data-group="' + group + '"]').forEach(function (x) { x.classList.remove('selected'); });
        rc.classList.add('selected');
        var input = $('input', rc); if (input) input.checked = true;
      });
    });
    // upsell add — pick the first size that is actually buyable, so the card
    // adds what it advertises (bac water: 10 ml, since 3 ml is sold out)
    $$('[data-upsell]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = T.bySlug(b.dataset.upsell);
        var opt = null;
        if (p.type === 'variable') {
          var want = b.dataset.upsellOption;
          opt = want && p.options.filter(function (o) { return o.label === want; })[0];
          if (!opt) opt = p.options.filter(function (o) { return !T.isSoldOut(p.slug, o.label); })[0];
          if (!opt || T.isSoldOut(p.slug, opt.label)) return; // sold out → do nothing
        }
        Cart.add(p, opt, 1);
        b.textContent = t('co_added');
        renderCheckout();
      });
    });
    // collapsible promo code
    var pt = $('#promoToggle');
    if (pt && !pt.dataset.wired) {
      pt.dataset.wired = '1';
      pt.addEventListener('click', function () {
        var blk = $('#promoBlock');
        var open = blk.classList.toggle('open');
        pt.setAttribute('aria-expanded', String(open));
      });
    }
  }

  /* ---- account tabs ---- */
  function switchAuth(mode) {
    $$('.auth-tab').forEach(function (tab) { tab.setAttribute('aria-selected', String(tab.dataset.mode === mode)); });
    var reg = mode === 'register';
    $('#nameField').style.display = reg ? '' : 'none';
    $('#authSubmit').textContent = reg ? t('acc_create') : t('acc_signin');
    $('#authRow').style.display = reg ? 'none' : 'flex';
    $('#authTitle').textContent = reg ? t('acc_create_title') : t('acc_welcome');
  }

  /* ---- faq / accordion (shared) ---- */
  function initFaqAccordion() {
    $$('.faq-q').forEach(function (q) {
      q.addEventListener('click', function () {
        var item = q.closest('.faq-item');
        var open = item.classList.contains('open');
        item.classList.toggle('open', !open);
        q.setAttribute('aria-expanded', String(!open));
      });
    });
  }

  /* =================================================================
     BOOT
  ================================================================= */
  Cart.load();
  buildChrome();
  if (Pages[page]) Pages[page]();
})();
