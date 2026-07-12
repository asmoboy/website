(function () {
  'use strict';

  /* ---------------------------------------------------------------
     Product data + reusable vial illustration
  --------------------------------------------------------------- */
  var products = [
    { category: 'PEPTIDE', name: 'BPC-157', mg: '5MG', price: 54.0, oldPrice: null },
    { category: 'PEPTIDE', name: 'Tesamorelin', mg: '10MG', price: 89.0, oldPrice: 109.0 },
    { category: 'BLEND', name: 'CJC-1295 + Ipamorelin', mg: '5/5MG', price: 80.1, oldPrice: 89.0 },
    { category: 'PEPTIDE', name: 'GHK-Cu', mg: '100MG', price: 64.0, oldPrice: null },
    { category: 'PEPTIDE', name: 'Semaglutide', mg: '5MG', price: 95.0, oldPrice: null },
    { category: 'PEPTIDE', name: 'Retatrutide', mg: '10MG', price: 149.0, oldPrice: null },
    { category: 'SOLUTION', name: 'Bacteriostatic Water', mg: '10ML', price: 14.0, oldPrice: null },
    { category: 'NASAL', name: 'Nasal Spray Base', mg: '15ML', price: 22.0, oldPrice: 26.0 }
  ];

  function formatPrice(n) {
    return '€' + n.toFixed(2).replace('.', ',');
  }

  function vialSVG(name, mg) {
    var label = name.length > 16 ? name.slice(0, 15) + '…' : name;
    var nameSize = label.length > 12 ? 8.5 : 11;
    return (
      '<svg viewBox="0 0 200 220" aria-hidden="true">' +
      '<rect x="72" y="0" width="56" height="26" rx="4" fill="#232327"/>' +
      '<rect x="84" y="22" width="32" height="16" fill="rgba(14,14,16,0.05)"/>' +
      '<rect x="46" y="38" width="108" height="172" rx="12" fill="#fff" stroke="rgba(14,14,16,0.15)" stroke-width="2"/>' +
      '<line x1="46" y1="168" x2="154" y2="168" stroke="rgba(14,14,16,0.1)" stroke-width="2"/>' +
      '<rect x="56" y="92" width="88" height="68" fill="#0E0E10"/>' +
      '<text x="100" y="110" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="9" fill="#F6F5F1">TOP PEP</text>' +
      '<line x1="66" y1="117" x2="134" y2="117" stroke="rgba(246,245,241,0.2)"/>' +
      '<text x="100" y="135" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-weight="600" font-size="' + nameSize + '" fill="#F6F5F1">' + label + '</text>' +
      '<text x="100" y="150" text-anchor="middle" font-family="Space Mono, monospace" font-size="8" fill="#5E17EB">' + mg + '</text>' +
      '</svg>'
    );
  }

  function renderProducts() {
    var grid = document.getElementById('productGrid');
    if (!grid) return;
    var html = products.map(function (p) {
      return (
        '<div class="product-card">' +
          '<div class="card-media">' +
            '<span class="badge-category label">' + p.category + '</span>' +
            (p.oldPrice ? '<span class="badge-sale label">Sale</span>' : '') +
            vialSVG(p.name, p.mg) +
          '</div>' +
          '<div class="card-info">' +
            '<div class="name">' + p.name + ' ' + p.mg.replace('MG', 'mg').replace('ML', 'ml') + '</div>' +
            '<div class="price-row">' +
              '<span>' + (p.oldPrice ? '<span class="price-old">' + formatPrice(p.oldPrice) + '</span>' : '') +
                '<span class="price-current">' + formatPrice(p.price) + '</span></span>' +
              '<button type="button" class="add-btn" data-name="' + p.name + '" data-price="' + p.price + '">+ Cart</button>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }).join('');
    grid.innerHTML = html;
  }

  /* ---------------------------------------------------------------
     Cart (visual only — demo state, no backend)
  --------------------------------------------------------------- */
  var cartCount = 0;
  var cartBadge = document.getElementById('cartBadge');
  var cartBtn = document.getElementById('cartBtn');

  function addToCart(qty) {
    cartCount += (qty || 1);
    if (cartBadge) cartBadge.textContent = String(cartCount);
    if (cartBtn) cartBtn.setAttribute('aria-label', 'Cart, ' + cartCount + ' items');
    if (cartBtn) {
      cartBtn.classList.remove('bump');
      void cartBtn.offsetWidth;
      cartBtn.classList.add('bump');
    }
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.add-btn');
    if (btn) addToCart(1);
  });

  /* ---------------------------------------------------------------
     Quantity stepper + main add-to-cart / sticky bar add-to-cart
  --------------------------------------------------------------- */
  var qtyValue = document.getElementById('qtyValue');
  var qtyMinus = document.getElementById('qtyMinus');
  var qtyPlus = document.getElementById('qtyPlus');
  var qty = 1;

  function renderQty() {
    if (qtyValue) qtyValue.textContent = String(qty);
  }
  if (qtyMinus) qtyMinus.addEventListener('click', function () {
    qty = Math.max(1, qty - 1);
    renderQty();
  });
  if (qtyPlus) qtyPlus.addEventListener('click', function () {
    qty = Math.min(99, qty + 1);
    renderQty();
  });

  var addToCartMain = document.getElementById('addToCartMain');
  var addToCartSticky = document.getElementById('addToCartSticky');
  function confirmAdd(button) {
    if (!button) return;
    var original = button.textContent;
    button.textContent = 'Added ✓';
    addToCart(qty);
    setTimeout(function () {
      button.textContent = original;
    }, 1400);
  }
  if (addToCartMain) addToCartMain.addEventListener('click', function () { confirmAdd(addToCartMain); });
  if (addToCartSticky) addToCartSticky.addEventListener('click', function () { confirmAdd(addToCartSticky); });

  /* ---------------------------------------------------------------
     Mobile navigation
  --------------------------------------------------------------- */
  var menuToggle = document.getElementById('menuToggle');
  var closeMenu = document.getElementById('closeMenu');
  var mobileNav = document.getElementById('mobileNav');

  function openMobileNav() {
    mobileNav.classList.add('open');
    menuToggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    var firstLink = mobileNav.querySelector('a');
    if (firstLink) firstLink.focus();
  }
  function closeMobileNav() {
    mobileNav.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    menuToggle.focus();
  }
  if (menuToggle) menuToggle.addEventListener('click', openMobileNav);
  if (closeMenu) closeMenu.addEventListener('click', closeMobileNav);
  if (mobileNav) mobileNav.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', closeMobileNav);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && mobileNav.classList.contains('open')) closeMobileNav();
  });

  /* ---------------------------------------------------------------
     Tabs
  --------------------------------------------------------------- */
  var tabButtons = document.querySelectorAll('.tab-nav button');
  var tabPanels = document.querySelectorAll('.tab-panel');
  tabButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      tabButtons.forEach(function (b) { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
      tabPanels.forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      var target = document.querySelector('[data-panel="' + btn.dataset.tab + '"]');
      if (target) target.classList.add('active');
    });
  });

  /* ---------------------------------------------------------------
     Sticky bar visibility (hidden over hero + footer)
  --------------------------------------------------------------- */
  var stickyBar = document.getElementById('stickyBar');
  var heroEl = document.querySelector('.hero');
  var footerEl = document.querySelector('footer');
  var heroPassed = false;
  var footerReached = false;

  function updateStickyBar() {
    if (!stickyBar) return;
    if (heroPassed && !footerReached) {
      stickyBar.classList.add('visible');
    } else {
      stickyBar.classList.remove('visible');
    }
  }

  if ('IntersectionObserver' in window && heroEl && footerEl) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        heroPassed = !entry.isIntersecting && entry.boundingClientRect.top < 0;
      });
      updateStickyBar();
    }, { threshold: 0 }).observe(heroEl);

    new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        footerReached = entry.isIntersecting;
      });
      updateStickyBar();
    }, { threshold: 0.05 }).observe(footerEl);
  }

  /* ---------------------------------------------------------------
     Newsletter (demo — no backend)
  --------------------------------------------------------------- */
  var newsletterForm = document.getElementById('newsletterForm');
  var newsletterStatus = document.getElementById('newsletterStatus');
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', function (e) {
      e.preventDefault();
      newsletterStatus.textContent = 'You’re on the list — check your inbox to confirm.';
      newsletterForm.reset();
    });
  }

  /* ---------------------------------------------------------------
     Init
  --------------------------------------------------------------- */
  renderProducts();
})();
