// ============================================================
//  script.js — Beauty's Jewelry Collection
//  Public-facing UI logic: products, cart, animations, admin UI
// ============================================================

import {
  onAuthChange, adminLogin, adminLogout,
  fetchProducts, addProduct, updateProduct, deleteProduct,
  uploadProductImage
} from "./firebase.js";

// ── State ─────────────────────────────────────────────────────
let cart           = [];          // [{...product, qty}]
let allProducts    = [];          // fetched from Firestore
let currentFilter  = "all";
let currentAdmin   = null;        // Firebase user | null
let editingProduct = null;        // product being edited

// ─────────────────────────────────────────────────────────────
// DOM ELEMENTS
// ─────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const productsGrid     = $("productsGrid");
const cartCountEl      = $("cartCount");
const cartItemsEl      = $("cartItems");
const cartTotalEl      = $("cartTotal");
const cartFooterEl     = $("cartFooter");
const cartSidebarEl    = $("cartSidebar");
const toastEl          = $("toast");
const header           = $("header");
const hamburger        = $("hamburger");
const mobileDrawer     = $("mobileDrawer");
const drawerOverlay    = $("drawerOverlay");

// Admin elements
const adminOverlay     = $("adminOverlay");
const adminLoginBox    = $("adminLoginBox");
const adminPanelBox    = $("adminPanelBox");
const adminLoginError  = $("adminLoginError");
const loginForm        = $("loginForm");
const addProductForm   = $("addProductForm");
const adminTableBody   = $("adminTableBody");
const editOverlay      = $("editOverlay");
const editForm         = $("editForm");
const imagePreview     = $("imagePreview");
const uploadProgress   = $("uploadProgress");
const progressBarFill  = $("progressBarFill");
const progressText     = $("progressText");
const adminNavLink     = $("adminNavLink");
const adminMobileLink  = $("adminMobileLink");
const logoutBtn        = $("logoutBtn");

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
const formatPrice = n => "₦" + Number(n).toLocaleString("en-NG");

function showToast(msg, type = "default") {
  toastEl.textContent = msg;
  toastEl.style.background = type === "error" ? "#EF4444" : "";
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 2800);
}

// ─────────────────────────────────────────────────────────────
// HEADER SCROLL EFFECT
// ─────────────────────────────────────────────────────────────
window.addEventListener("scroll", () => {
  header.classList.toggle("scrolled", window.scrollY > 60);
});

// ─────────────────────────────────────────────────────────────
// HAMBURGER / MOBILE DRAWER
// ─────────────────────────────────────────────────────────────
hamburger.addEventListener("click", () => {
  const open = mobileDrawer.classList.toggle("open");
  hamburger.classList.toggle("open", open);
  drawerOverlay.classList.toggle("open", open);
});
drawerOverlay.addEventListener("click", closeDrawer);

function closeDrawer() {
  mobileDrawer.classList.remove("open");
  hamburger.classList.remove("open");
  drawerOverlay.classList.remove("open");
}
// expose for inline onclick
window.closeDrawer = closeDrawer;

// ─────────────────────────────────────────────────────────────
// CART
// ─────────────────────────────────────────────────────────────
function openCart()  { cartSidebarEl.classList.add("open"); }
function closeCart() { cartSidebarEl.classList.remove("open"); }

window.openCart  = openCart;
window.closeCart = closeCart;

$("cartBtn").addEventListener("click", openCart);
$("cartClose").addEventListener("click", closeCart);

function addToCart(product) {
  const existing = cart.find(i => i.id === product.id);
  if (existing) existing.qty++;
  else cart.push({ ...product, qty: 1 });
  updateCartUI();
  showToast(`✨ ${product.name} added to cart!`);
  // cart does NOT open automatically
}
window.addToCart = addToCart;

// Pay Now — single product checkout (bypasses cart)
window.payNow = function(product) {
  // Temporarily store cart, replace with single item
  const savedCart = [...cart];

  // Set cart to just this one product for payment
  cart = [{ ...product, qty: 1 }];

  const total = product.price;
  const count = 1;

  // Fill checkout modal summary
  $("checkoutTotal").textContent     = formatPrice(total);
  $("checkoutItemCount").textContent = "1 item";

  // Open checkout modal
  $("checkoutOverlay").classList.add("open");

  // Override proceedToPaystack for this single product
  // Restore original cart after payment (success or close)
  const originalCart = savedCart;

  const originalProceed = window.proceedToPaystack;
  window.proceedToPaystack = function() {
    const name  = $("customer-name").value.trim();
    const email = $("customer-email").value.trim();
    const phone = $("customer-phone").value.trim();

    if (!name)  { showToast("❌ Please enter your name", "error"); return; }
    if (!email || !email.includes("@")) { showToast("❌ Please enter a valid email", "error"); return; }
    if (!phone) { showToast("❌ Please enter your phone number", "error"); return; }

    const handler = PaystackPop.setup({
      key:      "pk_test_3ca2e6b4b981a5e00177090bdc0edce0b6fc3ffc",
      email:    email,
      amount:   total * 100,
      currency: "NGN",
      ref:      "beauty_paynow_" + Date.now(),
      metadata: {
        custom_fields: [
          { display_name: "Customer Name", variable_name: "customer_name", value: name },
          { display_name: "Phone Number",  variable_name: "phone_number",  value: phone },
          { display_name: "Product",       variable_name: "product_name",  value: product.name }
        ]
      },
      callback: function(response) {
        closeCheckout();
        showToast("✅ Payment successful! Ref: " + response.reference);
        // Save order with just this product
        const singleItem = [{ id: product.id, name: product.name, price: product.price, qty: 1 }];
        saveOrder(response.reference, name, email, phone, singleItem, total);
        // Restore original cart
        cart = originalCart;
        updateCartUI();
        window.proceedToPaystack = originalProceed;
      },
      onClose: function() {
        // Restore original cart if closed
        cart = originalCart;
        updateCartUI();
        window.proceedToPaystack = originalProceed;
        showToast("Payment window closed.");
      }
    });
    handler.openIframe();
  };
};


function removeFromCart(id) {
  cart = cart.filter(i => i.id !== id);
  updateCartUI();
}
window.removeFromCart = removeFromCart;

function updateCartUI() {
  const total = cart.reduce((a, i) => a + i.price * i.qty, 0);
  const count = cart.reduce((a, i) => a + i.qty, 0);
  cartCountEl.textContent = count;

  if (cart.length === 0) {
    cartItemsEl.innerHTML = `<div class="cart-empty"><i class="fas fa-shopping-bag"></i><p>Your cart is empty</p><p style="font-size:.82rem;margin-top:8px">Add some beautiful pieces!</p></div>`;
    cartFooterEl.style.display = "none";
  } else {
    cartItemsEl.innerHTML = cart.map(i => `
      <div class="cart-item">
        <img src="${i.imageUrl}" alt="${i.name}" onerror="this.src='https://via.placeholder.com/64x64/ede9fe/6b21a8?text=💎'">
        <div class="cart-item-info">
          <div class="cart-item-name">${i.name}</div>
          <div class="cart-item-price">${formatPrice(i.price)} × ${i.qty}</div>
        </div>
        <button class="cart-item-remove" onclick="removeFromCart('${i.id}')"><i class="fas fa-trash-alt"></i></button>
      </div>`).join("");
    cartTotalEl.textContent = formatPrice(total);
    cartFooterEl.style.display = "block";
  }
}
// ─────────────────────────────────────────────────────────────
// CHECKOUT MODAL
// ─────────────────────────────────────────────────────────────
function openCheckout() {
  if (cart.length === 0) {
    showToast("❌ Your cart is empty!", "error");
    return;
  }
  const total = cart.reduce((a, i) => a + i.price * i.qty, 0);
  const count = cart.reduce((a, i) => a + i.qty, 0);
  $("checkoutTotal").textContent    = formatPrice(total);
  $("checkoutItemCount").textContent = count + " item" + (count > 1 ? "s" : "");
  $("checkoutOverlay").classList.add("open");
}
window.openCheckout = openCheckout;

function closeCheckout() {
  $("checkoutOverlay").classList.remove("open");
}
window.closeCheckout = closeCheckout;

// Close checkout when clicking backdrop
$("checkoutOverlay").addEventListener("click", e => {
  if (e.target === $("checkoutOverlay")) closeCheckout();
});

// ─────────────────────────────────────────────────────────────
// PAYSTACK PAYMENT
// ─────────────────────────────────────────────────────────────
window.proceedToPaystack = function () {
  const name  = $("customer-name").value.trim();
  const email = $("customer-email").value.trim();
  const phone = $("customer-phone").value.trim();

  if (!name)  { showToast("❌ Please enter your name", "error"); return; }
  if (!email || !email.includes("@")) { showToast("❌ Please enter a valid email", "error"); return; }
  if (!phone) { showToast("❌ Please enter your phone number", "error"); return; }

  const total = cart.reduce((a, i) => a + i.price * i.qty, 0);

  const handler = PaystackPop.setup({
    key:      "pk_test_3ca2e6b4b981a5e00177090bdc0edce0b6fc3ffc",
    email:    email,
    amount:   total * 100,  // Paystack uses kobo
    currency: "NGN",
    ref:      "beauty_" + Date.now(),
    metadata: {
      custom_fields: [
        { display_name: "Customer Name",  variable_name: "customer_name",  value: name  },
        { display_name: "Phone Number",   variable_name: "phone_number",   value: phone }
      ]
    },
    callback: function (response) {
      closeCheckout();
      closeCart();
      showToast("✅ Payment successful! Ref: " + response.reference);
      saveOrder(response.reference, name, email, phone, null, null); // save order with full cart details
      cart = [];
      updateCartUI();
    },
    onClose: function () {
      showToast("Payment window closed.", "error");
    }
  });

  handler.openIframe();
};

// ─────────────────────────────────────────────────────────────
// SAVE ORDER TO FIRESTORE
// ─────────────────────────────────────────────────────────────
async function saveOrder(reference, name, email, phone) {
  try {
    const { db } = await import("./firebase.js");
    const { collection, addDoc } = await import(
      "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"
    );
    await addDoc(collection(db, "orders"), {
      reference,
      customerName:  name,
      customerEmail: email,
      customerPhone: phone,
      items: cart.map(i => ({ id: i.id, name: i.name, price: i.price, qty: i.qty })),
      total: cart.reduce((a, i) => a + i.price * i.qty, 0),
      status: "paid",
      date:   new Date().toISOString()
    });
    console.log("✅ Order saved to Firestore");
  } catch (err) {
    console.error("Order save failed:", err);
  }
}

// ─────────────────────────────────────────────────────────────
// WISHLIST
// ─────────────────────────────────────────────────────────────
window.toggleWishlist = function (btn) {
  btn.classList.toggle("active");
};

// ─────────────────────────────────────────────────────────────
// CATEGORY FILTER
// ─────────────────────────────────────────────────────────────
document.querySelectorAll(".filter-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".filter-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    currentFilter = tab.dataset.filter;
    renderProducts();
  });
});

// ─────────────────────────────────────────────────────────────
// RENDER PRODUCTS
// ─────────────────────────────────────────────────────────────
function renderProducts() {
  const list = currentFilter === "all"
    ? allProducts
    : allProducts.filter(p => p.category === currentFilter);

  if (list.length === 0) {
    productsGrid.innerHTML = `<div class="cart-empty" style="grid-column:1/-1;padding:60px 20px"><i class="fas fa-gem"></i><p>No products in this category yet</p></div>`;
    return;
  }

  productsGrid.innerHTML = list.map((p, i) => `
    <div class="product-card reveal" style="transition-delay:${(i%4)*.08}s">
      <div class="product-card-image">
        <img src="${p.imageUrl}" alt="${p.name}" loading="lazy"
             onerror="this.src='https://images.unsplash.com/photo-1617038260897-41a1f14a8ca0?w=500&q=80'">
        ${p.badge ? `<div class="product-badge${p.isNew?' new':''}">${p.badge}</div>` : (p.isNew ? '<div class="product-badge new">New</div>' : '')}
        <button class="product-wishlist" onclick="toggleWishlist(this)" aria-label="Wishlist">
          <i class="fas fa-heart"></i>
        </button>
      </div>
      <div class="product-info">
        <div class="product-category">${categoryLabel(p.category)}</div>
        <div class="product-name">${p.name}</div>
        <div class="product-price">
          ${formatPrice(p.price)}
          ${p.oldPrice ? `<span class="product-price-old">${formatPrice(p.oldPrice)}</span>` : ""}
        </div>
        <div class="product-actions">
          <button class="btn-cart" onclick='addToCart(${JSON.stringify(p)})'><i class="fas fa-shopping-bag"></i> Add to Cart</button>
          <button class="btn-pay"  onclick='payNow(${JSON.stringify(p)})'><i class="fas fa-bolt"></i> Pay Now</button>
        </div>
      </div>
    </div>`).join("");
  observeReveal();
}

function categoryLabel(c) {
  return { earrings:"Earrings", necklaces:"Necklaces", gold:"Gold Jewelry", silver:"Silver Jewelry" }[c] || c;
}

function showSkeletons(n = 8) {
  productsGrid.innerHTML = Array(n).fill(`
    <div class="product-skeleton">
      <div class="skeleton-img"></div>
      <div class="skeleton-info">
        <div class="skeleton-line short"></div>
        <div class="skeleton-line"></div>
        <div class="skeleton-line price"></div>
        <div class="skeleton-line"></div>
      </div>
    </div>`).join("");
}

// ─────────────────────────────────────────────────────────────
// LOAD PRODUCTS FROM FIREBASE
// ─────────────────────────────────────────────────────────────
async function loadProducts() {
  showSkeletons();
  try {
   allProducts = await fetchProducts();

if (allProducts.length === 0) {
  allProducts = getDemoProducts();
}

renderProducts();
  } catch (err) {
    console.error("Failed to load products:", err);
    // Fallback to demo products if Firebase not configured
    allProducts = getDemoProducts();
    renderProducts();
  }
}

// Demo products (shown before Firebase is configured)
function getDemoProducts() {
  return [
    { id:"d1", name:"Celestial Drop Earrings",   category:"earrings",  price:18500, oldPrice:24000, imageUrl:"https://images.unsplash.com/photo-1617038260897-41a1f14a8ca0?w=500&q=80", badge:"Sale",  isNew:false },
    { id:"d2", name:"Gold Hoop Elegance",         category:"earrings",  price:22000, oldPrice:0,     imageUrl:"https://images.unsplash.com/photo-1574180566232-aaad1b5b8450?w=500&q=80", badge:"",      isNew:false },
    { id:"d3", name:"Pearl Chandelier Drops",     category:"earrings",  price:15800, oldPrice:0,     imageUrl:"https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?w=500&q=80", badge:"",      isNew:true  },
    { id:"d4", name:"Golden Layered Necklace",    category:"necklaces", price:35000, oldPrice:42000, imageUrl:"https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=500&q=80", badge:"Sale",  isNew:false },
    { id:"d5", name:"Delicate Diamond Pendant",   category:"necklaces", price:48500, oldPrice:0,     imageUrl:"https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=500&q=80", badge:"",      isNew:true  },
    { id:"d6", name:"Crystal Choker Set",         category:"necklaces", price:28000, oldPrice:35000, imageUrl:"https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=500&q=80", badge:"Sale",  isNew:false },
    { id:"d7", name:"24K Gold Statement Ring",    category:"gold",      price:55000, oldPrice:0,     imageUrl:"https://images.unsplash.com/photo-1605100804763-247f67b3557e?w=500&q=80", badge:"",      isNew:true  },
    { id:"d8", name:"Gold Rope Bracelet",         category:"gold",      price:42000, oldPrice:50000, imageUrl:"https://images.unsplash.com/photo-1573408301185-9519bf38d0b6?w=500&q=80", badge:"Sale",  isNew:false },
    { id:"d9", name:"Sterling Silver Cuff",       category:"silver",    price:27000, oldPrice:0,     imageUrl:"https://images.unsplash.com/photo-1611591437281-460bfbe1220a?w=500&q=80", badge:"",      isNew:true  },
    { id:"d10",name:"Silver Chain Necklace",      category:"silver",    price:21000, oldPrice:28000, imageUrl:"https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?w=500&q=80", badge:"Sale",  isNew:false },
    { id:"d11",name:"Silver Teardrop Earrings",   category:"silver",    price:16500, oldPrice:0,     imageUrl:"https://images.unsplash.com/photo-1617038260897-41a1f14a8ca0?w=500&q=80", badge:"",      isNew:false },
    { id:"d12",name:"Gold Beaded Anklet",         category:"gold",      price:19500, oldPrice:0,     imageUrl:"https://images.unsplash.com/photo-1602751584552-8ba73aad10e1?w=500&q=80", badge:"",      isNew:false },
  ];
}

// ─────────────────────────────────────────────────────────────
// SCROLL REVEAL (Intersection Observer)
// ─────────────────────────────────────────────────────────────
function observeReveal() {
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); }
    });
  }, { threshold: 0.1 });
  document.querySelectorAll(".reveal:not(.visible)").forEach(el => io.observe(el));
}

// ─────────────────────────────────────────────────────────────
// ADMIN AUTH STATE
// ─────────────────────────────────────────────────────────────
onAuthChange(user => {
  currentAdmin = user;
  if (user) {
    // Show admin panel, hide login box
    adminLoginBox.style.display  = "none";
    adminPanelBox.style.display  = "flex";
    adminNavLink.innerHTML       = '<i class="fas fa-shield-halved"></i> Admin Panel';
    adminMobileLink.innerHTML    = '<i class="fas fa-shield-halved"></i>Admin Panel';
    loadAdminProducts();
  } else {
    adminLoginBox.style.display  = "block";
    adminPanelBox.style.display  = "none";
    adminNavLink.innerHTML       = '<i class="fas fa-lock"></i> Admin';
    adminMobileLink.innerHTML    = '<i class="fas fa-lock"></i>Admin';
  }
});

// ─────────────────────────────────────────────────────────────
// OPEN / CLOSE ADMIN OVERLAY
// ─────────────────────────────────────────────────────────────
function openAdmin() {
  adminOverlay.classList.add("open");
  closeDrawer();
}
function closeAdmin() {
  adminOverlay.classList.remove("open");
}
window.openAdmin  = openAdmin;
window.closeAdmin = closeAdmin;

adminNavLink.addEventListener("click", e => { e.preventDefault(); openAdmin(); });
adminMobileLink.addEventListener("click", e => { e.preventDefault(); openAdmin(); });

// Close overlay when clicking the dark backdrop
adminOverlay.addEventListener("click", e => {
  if (e.target === adminOverlay) closeAdmin();
});
$("editOverlay").addEventListener("click", e => {
  if (e.target === $("editOverlay")) closeEditModal();
});

// ─────────────────────────────────────────────────────────────
// ADMIN LOGIN
// ─────────────────────────────────────────────────────────────
loginForm.addEventListener("submit", async e => {
  e.preventDefault();
  const email    = $("adminEmail").value.trim();
  const password = $("adminPassword").value;
  const btn      = loginForm.querySelector("button[type=submit]");
  btn.disabled   = true; btn.textContent = "Signing in…";
  adminLoginError.style.display = "none";

  try {
    await adminLogin(email, password);
    // onAuthChange will handle the UI switch
  } catch (err) {
    adminLoginError.textContent    = "Invalid email or password. Please try again.";
    adminLoginError.style.display  = "block";
    btn.disabled = false; btn.textContent = "Sign In";
  }
});

// ─────────────────────────────────────────────────────────────
// ADMIN LOGOUT
// ─────────────────────────────────────────────────────────────
logoutBtn.addEventListener("click", async () => {
  await adminLogout();
  closeAdmin();
});

// ─────────────────────────────────────────────────────────────
// ADMIN TABS
// ─────────────────────────────────────────────────────────────
document.querySelectorAll(".admin-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".admin-tab-content").forEach(c => c.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`.admin-tab-content[data-tab="${tab.dataset.tab}"]`).classList.add("active");
  });
});

// ─────────────────────────────────────────────────────────────
// IMAGE PREVIEW (add form)
// ─────────────────────────────────────────────────────────────
$("productImageInput").addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  imagePreview.src     = url;
  imagePreview.style.display = "block";
});

// ─────────────────────────────────────────────────────────────
// ADD PRODUCT
// ─────────────────────────────────────────────────────────────
addProductForm.addEventListener("submit", async e => {
  e.preventDefault();
  const submitBtn = addProductForm.querySelector(".form-submit-btn");
  submitBtn.disabled = true; submitBtn.textContent = "Uploading…";

  const file     = $("productImageInput").files[0];

  if (!file) {
    showToast("❌ Please select an image", "error");
    submitBtn.disabled = false;
    submitBtn.textContent = "Add Product";
    return;
  }
  const name     = $("productName").value.trim();
  const category = $("productCategory").value;
  const price    = Number($("productPrice").value);
  const oldPrice = Number($("productOldPrice").value) || 0;
  const badge    = $("productBadge").value.trim();
  const isNew    = $("productIsNew").checked;

  try {
    let imageUrl = "", storagePath = "";

    if (file) {
      uploadProgress.style.display = "block";
      const result = await uploadProductImage(file, pct => {
        progressBarFill.style.width = pct + "%";
        progressText.textContent    = `Uploading… ${pct}%`;
        console.log("Uploading file:", file);
      });
      imageUrl    = result.url;
      storagePath = result.path;
      uploadProgress.style.display = "none";
    }

    await addProduct({ name, category, price, oldPrice, badge, isNew, imageUrl, storagePath });
    showToast("✅ Product added successfully!");
    addProductForm.reset();
    imagePreview.style.display = "none";
    progressBarFill.style.width = "0";
    await loadProducts();          // refresh public grid
    await loadAdminProducts();     // refresh admin table
  } catch (err) {
    console.error(err);
    showToast("❌ Failed to add product. Check console.", "error");
  } finally {
    submitBtn.disabled = false; submitBtn.textContent = "Add Product";
  }
});

// ─────────────────────────────────────────────────────────────
// LOAD PRODUCTS FOR ADMIN TABLE
// ─────────────────────────────────────────────────────────────
async function loadAdminProducts() {
  adminTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text-muted)"><i class="fas fa-circle-notch fa-spin"></i> Loading…</td></tr>`;
  try {
    const list = await fetchProducts();
    if (list.length === 0) {
      adminTableBody.innerHTML = `<tr><td colspan="6"><div class="admin-empty"><i class="fas fa-box-open"></i><p>No products yet. Add your first one!</p></div></td></tr>`;
      return;
    }
    adminTableBody.innerHTML = list.map(p => `
      <tr>
        <td><img src="${p.imageUrl}" class="admin-product-img" alt="${p.name}" onerror="this.src='https://via.placeholder.com/52x52/ede9fe/6b21a8?text=💎'"></td>
        <td><div class="admin-product-name">${p.name}</div><div class="admin-product-cat">${categoryLabel(p.category)}</div></td>
        <td>${formatPrice(p.price)}</td>
        <td>${p.oldPrice ? formatPrice(p.oldPrice) : "—"}</td>
        <td>${p.badge || (p.isNew ? "New" : "—")}</td>
        <td>
          <button class="admin-action-btn btn-edit"   onclick="openEditModal('${p.id}')"><i class="fas fa-pen"></i> Edit</button>
          <button class="admin-action-btn btn-delete" onclick="confirmDelete('${p.id}','${(p.storagePath||"").replace(/'/g,"\\'")}','${p.name.replace(/'/g,"\\'")}')"><i class="fas fa-trash"></i> Delete</button>
        </td>
      </tr>`).join("");
  } catch (err) {
    console.error(err);
    adminTableBody.innerHTML = `<tr><td colspan="6" style="color:var(--danger);padding:20px">Failed to load products.</td></tr>`;
  }
}

// ─────────────────────────────────────────────────────────────
// EDIT PRODUCT
// ─────────────────────────────────────────────────────────────
window.openEditModal = function (id) {
  editingProduct = allProducts.find(p => p.id === id) || { id };
  const p = editingProduct;
  $("editProductId").value       = p.id;
  $("editProductName").value     = p.name || "";
  $("editProductCategory").value = p.category || "earrings";
  $("editProductPrice").value    = p.price || "";
  $("editProductOldPrice").value = p.oldPrice || "";
  $("editProductBadge").value    = p.badge || "";
  $("editProductIsNew").checked  = !!p.isNew;
  $("editOverlay").classList.add("open");
};

window.closeEditModal = function () {
  $("editOverlay").classList.remove("open");
  editingProduct = null;
};

editForm.addEventListener("submit", async e => {
  e.preventDefault();
  if (!editingProduct) return;
  const btn = editForm.querySelector(".form-submit-btn");
  btn.disabled = true; btn.textContent = "Saving…";

  const updates = {
    name:      $("editProductName").value.trim(),
    category:  $("editProductCategory").value,
    price:     Number($("editProductPrice").value),
    oldPrice:  Number($("editProductOldPrice").value) || 0,
    badge:     $("editProductBadge").value.trim(),
    isNew:     $("editProductIsNew").checked,
  };

  // Handle new image upload for edit
  const file = $("editProductImageInput").files[0];
  if (file) {
    const result = await uploadProductImage(file, () => {});
    updates.imageUrl    = result.url;
    updates.storagePath = result.path;
  }

  try {
    await updateProduct(editingProduct.id, updates);
    showToast("✅ Product updated!");
    closeEditModal();
    await loadProducts();
    await loadAdminProducts();
  } catch (err) {
    console.error(err);
    showToast("❌ Update failed.", "error");
  } finally {
    btn.disabled = false; btn.textContent = "Save Changes";
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE PRODUCT
// ─────────────────────────────────────────────────────────────
window.confirmDelete = function (id, storagePath, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  deleteProduct(id, storagePath)
    .then(() => { showToast("🗑️ Product deleted."); loadProducts(); loadAdminProducts(); })
    .catch(err => { console.error(err); showToast("❌ Delete failed.", "error"); });
};

// ─────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────
loadProducts();
observeReveal();
