'use strict';
/* Live catalog (prices, sale discounts, stock) — same file the storefront
   itself uses, so this page can never show Google a stale price. */
const TOPPEP=require('../data.js');
const PRODUCTS=TOPPEP.products;
const AVAILABILITY={in_stock:'https://schema.org/InStock',backorder:'https://schema.org/PreOrder',sold_out:'https://schema.org/OutOfStock'};
function availabilityOf(p){
 if(p.type==='variable'){
  const minPrice=Math.min.apply(null,p.options.map(o=>o.price));
  const opt=p.options.find(o=>o.price===minPrice);
  return TOPPEP.stockStatus(p.slug,opt.label);
 }
 return TOPPEP.stockStatus(p.slug);
}
const COPY={
 en:{section:'products',catalog:'Research peptides',research:'For laboratory research only',from:'From',cta:'View product and order',back:'All research compounds',desc:'Third-party tested research compound supplied strictly for in-vitro laboratory use.'},
 de:{section:'produkte',catalog:'Forschungspeptide',research:'Ausschließlich für Laborforschung',from:'Ab',cta:'Produkt ansehen und bestellen',back:'Alle Forschungsprodukte',desc:'Unabhängig getestetes Forschungsprodukt, ausschließlich für In-vitro-Laborforschung bestimmt.'},
 ro:{section:'produse',catalog:'Peptide pentru cercetare',research:'Exclusiv pentru cercetare de laborator',from:'De la',cta:'Vezi produsul și comandă',back:'Toate produsele de cercetare',desc:'Compus testat independent, destinat exclusiv cercetării de laborator in-vitro.'}
};
function esc(v){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
module.exports=(req,res)=>{
 const lang=COPY[req.query.lang]?req.query.lang:'en', c=COPY[lang], p=PRODUCTS.find(x=>x.slug===req.query.slug);
 if(!p){res.statusCode=404;res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<!doctype html><title>Not found</title><h1>Product not found</h1>');}
 const base='https://www.top-pep.com', canonical=base+'/'+lang+'/'+c.section+'/'+p.slug+'/', image=base+TOPPEP.imgUrl(p.img);
 const price=TOPPEP.priceOf(p);
 const title=p.full+' — '+c.catalog+' | TOP Pep', description=(p.blurb||c.desc)+' '+c.research+'.';
 const urls={en:base+'/en/products/'+p.slug+'/',de:base+'/de/produkte/'+p.slug+'/',ro:base+'/ro/produse/'+p.slug+'/'};
 const schema={'@context':'https://schema.org','@type':'Product','@id':canonical+'#product',name:p.full,image:[image],description:description,sku:p.slug,brand:{'@type':'Brand',name:'TOP Pep'},offers:{'@type':'Offer',url:canonical,priceCurrency:'EUR',price:Number(price).toFixed(2),availability:AVAILABILITY[availabilityOf(p)],itemCondition:'https://schema.org/NewCondition',seller:{'@type':'Organization',name:'TOP Pep'}}};
 res.setHeader('Content-Type','text/html; charset=utf-8');
 res.setHeader('Cache-Control','public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
 res.end(`<!DOCTYPE html><html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${canonical}"><link rel="alternate" hreflang="en" href="${urls.en}"><link rel="alternate" hreflang="de" href="${urls.de}"><link rel="alternate" hreflang="ro" href="${urls.ro}"><link rel="alternate" hreflang="x-default" href="${urls.en}">
<meta property="og:type" content="product"><meta property="og:site_name" content="TOP Pep"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${image}">
<link rel="icon" type="image/png" href="/logo.png"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Sora:wght@400;500;600&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="/styles.css?v=51">
<script type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\\u003c')}</script></head>
<body data-page="product"><a class="skip-link" href="#main">Skip to content</a><main id="main"><div class="wrap" style="padding-top:20px"><a class="link-arrow" href="/shop/">← ${esc(c.back)}</a></div>
<div class="wrap" id="productRoot"><article class="pd"><div class="pd-media"><div class="main-img"><img src="${image}" alt="${esc(p.full)}" width="800" height="800"></div></div><div class="pd-info"><span class="eyebrow">${esc(c.research)}</span><h1>${esc(p.full)}</h1><div class="pd-price">${esc(c.from)} €${Number(price).toFixed(2)}</div><p class="pd-desc">${esc(description)}</p><a class="btn btn-block" href="/product/?p=${encodeURIComponent(p.slug)}">${esc(c.cta)}</a></div></article></div><div style="height:80px"></div></main><div class="sticky-buy" id="stickyBuy"></div>
<script>try{localStorage.setItem('toppep_lang','${lang}')}catch(e){}</script><script src="/data.js?v=55"></script><script src="/app.js?v=56"></script></body></html>`);
};
