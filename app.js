// Supabase Configuration
const supabaseUrl = 'https://dmmvtrclrrnzxwlquilj.supabase.co';
const supabaseKey = 'sb_publishable__MpoUc7rmNCefVdE-SLRhg_KkdDdYaT';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// App State
const state = {
    isOnline: navigator.onLine,
    products: [],
    syncQueue: [],
    isAuthenticated: false
};

// --- DOM Elements ---
// Navigation
const navBtns = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.view');
// Status
const networkStatus = document.getElementById('network-status');
const statusDot = document.querySelector('.status-dot');
const statusText = document.querySelector('.status-text');
// Toast
const toast = document.getElementById('toast');

// Views
const viewCalcArea = document.getElementById('view-calc-area');
const viewCalcCustom = document.getElementById('view-calc-custom');
const viewMasterData = document.getElementById('view-master-data');

// Area Calc
const areaActivitySelect = document.getElementById('area-activity');
const areaInput = document.getElementById('area-input');
const btnCalcArea = document.getElementById('btn-calc-area');
const areaResultContainer = document.getElementById('area-result-container');
const areaResultWater = document.getElementById('area-result-water');
const areaChemicalsList = document.getElementById('area-chemicals-list');

// Custom Calc
const customDose = document.getElementById('custom-dose');
const customDoseUnit = document.getElementById('custom-dose-unit');
const customWaterRate = document.getElementById('custom-water-rate');
const customTabBtns = document.querySelectorAll('.tab-btn[data-target^="custom-mode"]');
const customModePanels = document.querySelectorAll('.custom-mode-panel');
const customWaterInput = document.getElementById('custom-water-input');
const btnCalcCustomWater = document.getElementById('btn-calc-custom-water');
const customChemInput = document.getElementById('custom-chem-input');
const customChemSuffix = document.getElementById('custom-chem-suffix');
const btnCalcCustomChem = document.getElementById('btn-calc-custom-chem');
const customResultContainer = document.getElementById('custom-result-container');
const customResultLabel = document.getElementById('custom-result-label');
const customResultValue = document.getElementById('custom-result-value');

// Master Data
const productList = document.getElementById('product-list');
const masterSearch = document.getElementById('master-search');
const btnShowAddProduct = document.getElementById('btn-show-add-product');
const masterDataListCard = document.getElementById('master-data-list-card');
const masterDataFormCard = document.getElementById('master-data-form-card');
const btnCancelAddProduct = document.getElementById('btn-cancel-add-product');
const addProductForm = document.getElementById('add-product-form');

// Auth
const authPassword = document.getElementById('auth-password');
const btnAuthVerify = document.getElementById('btn-auth-verify');
const authError = document.getElementById('auth-error');

// --- Initialization ---
async function initApp() {
    setupEventListeners(); // <-- Run this first so buttons work instantly!
    
    updateNetworkStatus();
    window.addEventListener('online', () => {
        state.isOnline = true;
        updateNetworkStatus();
        processSyncQueue();
    });
    window.addEventListener('offline', () => {
        state.isOnline = false;
        updateNetworkStatus();
    });

    await initDB();
    await loadProducts();
    
    // Register Service Worker for PWA
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js').then(() => {
            console.log('Service Worker Registered');
        }).catch(err => console.error('Service Worker registration failed:', err));
    }
}

// --- IndexedDB Setup ---
let db;
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('SprayCalcDB', 1);
        
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('products')) {
                db.createObjectStore('products', { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains('syncQueue')) {
                db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
            }
        };
        
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve();
        };
        
        request.onerror = (e) => reject(e);
    });
}

// --- Data Management ---
async function loadProducts() {
    try {
        if (state.isOnline) {
            // Fetch from Supabase
            const { data, error } = await supabaseClient.from('master_data').select('*').order('product_name');
            if (error) throw error;
            
            // Save to IDB
            const tx = db.transaction('products', 'readwrite');
            const store = tx.objectStore('products');
            store.clear();
            data.forEach(item => store.put(item));
            
            state.products = data;
        } else {
            // Fetch from IDB
            state.products = await new Promise((resolve) => {
                const tx = db.transaction('products', 'readonly');
                const store = tx.objectStore('products');
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result);
            });
        }
        
        renderProducts(state.products);
        updateActivitySelects();
    } catch (err) {
        console.error('Error loading products:', err);
        showToast('Error loading products. Check console.', 'error');
        
        // Fallback to IDB on error
        try {
            state.products = await new Promise((resolve, reject) => {
                const tx = db.transaction('products', 'readonly');
                const store = tx.objectStore('products');
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            });
        } catch (idbErr) {
            console.error('IDB fallback failed:', idbErr);
            state.products = [];
        }
        renderProducts(state.products);
        updateActivitySelects();
    }
}

async function saveActivity(originalName, activityName, waterRate, products) {
    // Determine which products to delete, update, and insert
    const existingProducts = originalName ? state.products.filter(p => (p.activity_name || 'Kegiatan Umum') === originalName) : [];
    
    const existingIds = existingProducts.map(p => p.id);
    const incomingIds = products.map(p => p.id).filter(id => id);
    const idsToDelete = existingIds.filter(id => !incomingIds.includes(id));

    // Delete removed products locally
    state.products = state.products.filter(p => !idsToDelete.includes(p.id));
    const tx = db.transaction('products', 'readwrite');
    idsToDelete.forEach(id => tx.objectStore('products').delete(id));

    // Process updates and inserts
    products.forEach(p => {
        p.activity_name = activityName;
        p.water_rate_per_ha = waterRate;
        if (!p.id) {
            p.id = crypto.randomUUID();
            p.created_at = new Date().toISOString();
            state.products.push(p);
        } else {
            const idx = state.products.findIndex(x => x.id === p.id);
            if (idx > -1) state.products[idx] = p;
        }
        tx.objectStore('products').put(p);
    });
    
    // Sort and render
    state.products.sort((a, b) => {
        const actA = a.activity_name || '';
        const actB = b.activity_name || '';
        return actA.localeCompare(actB) || a.product_name.localeCompare(b.product_name);
    });
    renderProducts(state.products);
    updateActivitySelects();

    // Sync online
    if (state.isOnline) {
        try {
            // Delete
            if (idsToDelete.length > 0) {
                await supabaseClient.from('master_data').delete().in('id', idsToDelete);
            }
            // Upsert (Insert/Update)
            if (products.length > 0) {
                const { error } = await supabaseClient.from('master_data').upsert(products);
                if (error) throw error;
            }
            showToast('Activity saved online!');
        } catch (err) {
            console.error('Supabase save error:', err);
            queueSync('bulk', { delete: idsToDelete, upsert: products });
            showToast('Saved offline. Will sync later.');
        }
    } else {
        queueSync('bulk', { delete: idsToDelete, upsert: products });
        showToast('Saved offline. Will sync later.');
    }
}

async function deleteActivityLocal(activityName) {
    const productsToDelete = state.products.filter(p => (p.activity_name || 'Kegiatan Umum') === activityName);
    const idsToDelete = productsToDelete.map(p => p.id);

    // Delete locally
    state.products = state.products.filter(p => !idsToDelete.includes(p.id));
    const tx = db.transaction('products', 'readwrite');
    idsToDelete.forEach(id => tx.objectStore('products').delete(id));
    
    renderProducts(state.products);
    updateActivitySelects();

    if (state.isOnline) {
        try {
            const { error } = await supabaseClient.from('master_data').delete().in('id', idsToDelete);
            if (error) throw error;
            showToast('Activity deleted!');
        } catch (err) {
            console.error('Supabase delete error:', err);
            queueSync('bulk', { delete: idsToDelete, upsert: [] });
            showToast('Deleted offline. Will sync later.');
        }
    } else {
        queueSync('bulk', { delete: idsToDelete, upsert: [] });
        showToast('Deleted offline. Will sync later.');
    }
}

function queueSync(action, payload) {
    const tx = db.transaction('syncQueue', 'readwrite');
    tx.objectStore('syncQueue').put({ action, payload });
}

async function processSyncQueue() {
    if (!state.isOnline) return;
    
    const queue = await new Promise(resolve => {
        const tx = db.transaction('syncQueue', 'readonly');
        const req = tx.objectStore('syncQueue').getAll();
        req.onsuccess = () => resolve(req.result);
    });

    if (queue.length === 0) return;

    for (const item of queue) {
        let error = null;
        if (item.action === 'bulk') {
            const { delete: delIds, upsert: upsertData } = item.payload;
            if (delIds && delIds.length > 0) {
                const { error: err1 } = await supabaseClient.from('master_data').delete().in('id', delIds);
                if (err1) error = err1;
            }
            if (upsertData && upsertData.length > 0 && !error) {
                const { error: err2 } = await supabaseClient.from('master_data').upsert(upsertData);
                if (err2) error = err2;
            }
        } else if (item.action === 'insert') {
            const { error: err } = await supabaseClient.from('master_data').insert([item.payload]);
            error = err;
        } else if (item.action === 'update') {
            const { error: err } = await supabaseClient.from('master_data').update(item.payload).eq('id', item.payload.id);
            error = err;
        } else if (item.action === 'delete') {
            const { error: err } = await supabaseClient.from('master_data').delete().eq('id', item.payload.id);
            error = err;
        }
        
        if (!error) {
            const tx = db.transaction('syncQueue', 'readwrite');
            tx.objectStore('syncQueue').delete(item.id);
        }
    }
    showToast('Offline data synced successfully!');
}

// --- UI Rendering ---
function renderProducts(products) {
    productList.innerHTML = '';
    if (products.length === 0) {
        productList.innerHTML = '<div class="loading-state">No products found.</div>';
        return;
    }

    // Group by activity_name
    const groups = {};
    products.forEach(p => {
        const act = p.activity_name || 'Kegiatan Umum';
        if (!groups[act]) groups[act] = [];
        groups[act].push(p);
    });

    const datalist = document.getElementById('activity-list');
    datalist.innerHTML = '';

    for (const [activityName, items] of Object.entries(groups)) {
        // Add to datalist
        const opt = document.createElement('option');
        opt.value = activityName;
        datalist.appendChild(opt);

        const groupDiv = document.createElement('div');
        groupDiv.className = 'activity-group';
        
        const header = document.createElement('div');
        header.className = 'activity-header';
        header.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <span>${activityName}</span>
                <span class="activity-badge">${items.length} Product(s)</span>
            </div>
            <div class="activity-actions" style="display: flex; gap: 8px;">
                <button class="btn-small-icon edit-activity-btn" data-activity="${activityName}" title="Edit Activity">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="btn-small-icon danger delete-activity-btn" data-activity="${activityName}" title="Delete Activity">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>
        `;
        groupDiv.appendChild(header);

        items.forEach(p => {
            const div = document.createElement('div');
            div.className = 'product-item';
            div.innerHTML = `
                <div class="product-info" style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                    <div style="font-weight: 600; font-size: 1.05rem; color: var(--text-main);">${p.product_name}</div>
                    <div style="color: var(--text-muted);">|</div>
                    <div style="font-size: 0.9rem; color: #a5b4fc;">${p.active_ingredients || '-'}</div>
                    <div style="color: var(--text-muted);">|</div>
                    <div style="font-size: 0.9rem; background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 4px;">🧪 ${p.dose_per_ha} ${p.dose_unit || 'L'}/Ha</div>
                    <div style="color: var(--text-muted);">|</div>
                    <div style="font-size: 0.9rem; background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 4px;">💧 ${p.water_rate_per_ha} L/Ha</div>
                </div>
            `;
            groupDiv.appendChild(div);
        });
        productList.appendChild(groupDiv);
    }
}

function updateActivitySelects() {
    areaActivitySelect.innerHTML = '<option value="">Select an activity...</option>';
    
    const activities = [...new Set(state.products.map(p => p.activity_name || 'Kegiatan Umum'))].sort();
    
    activities.forEach(act => {
        const opt1 = document.createElement('option');
        opt1.value = act;
        opt1.textContent = act;
        areaActivitySelect.appendChild(opt1);
    });
}

function updateNetworkStatus() {
    if (state.isOnline) {
        statusDot.className = 'status-dot online';
        statusText.textContent = 'Online';
    } else {
        statusDot.className = 'status-dot offline';
        statusText.textContent = 'Offline';
    }
}

function showToast(message, type = 'info') {
    toast.textContent = message;
    if (type === 'error') {
        toast.style.background = 'var(--error)';
    } else {
        toast.style.background = 'rgba(15, 23, 42, 0.95)';
    }
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// --- Event Listeners ---
function setupEventListeners() {
    // Navigation
    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            views.forEach(v => v.classList.remove('active-view'));
            
            btn.classList.add('active');
            const targetId = btn.dataset.target;
            document.getElementById(targetId).classList.add('active-view');
            
            if (targetId === 'view-master-data') {
                updateMasterDataView();
            }
        });
    });

    function updateMasterDataView() {
        masterDataFormCard.style.display = 'none';
        if (state.isAuthenticated) {
            document.getElementById('master-data-auth-card').style.display = 'none';
            masterDataListCard.style.display = 'block';
        } else {
            document.getElementById('master-data-auth-card').style.display = 'block';
            masterDataListCard.style.display = 'none';
        }
    }

    // Custom Calc Tabs
    customTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            customTabBtns.forEach(b => b.classList.remove('active'));
            customModePanels.forEach(p => p.style.display = 'none');
            
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).style.display = 'block';
            customResultContainer.style.display = 'none';
        });
    });

    // Master Data Search
    masterSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = state.products.filter(p => 
            p.product_name.toLowerCase().includes(query) || 
            (p.active_ingredients && p.active_ingredients.toLowerCase().includes(query))
        );
        renderProducts(filtered);
    });

    // Dynamic Form UI
    const productsContainer = document.getElementById('products-container');
    const btnAddProductRow = document.getElementById('btn-add-product-row');

    function addProductRow(p = null) {
        const row = document.createElement('div');
        row.className = 'product-row';
        row.style.cssText = 'background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 16px; border-radius: var(--radius-md); position: relative;';
        
        row.innerHTML = `
            <input type="hidden" class="row-prod-id" value="${p ? (p.id || '') : ''}">
            <div class="form-group" style="margin-bottom: 12px;">
                <label>Product Name *</label>
                <input type="text" class="input-modern row-prod-name" required placeholder="e.g. Primaquat" value="${p ? (p.product_name || '') : ''}">
            </div>
            <div class="form-group" style="margin-bottom: 12px;">
                <label>Active Ingredients</label>
                <input type="text" class="input-modern row-prod-active" placeholder="e.g. Paraquat" value="${p ? (p.active_ingredients || '') : ''}">
            </div>
            <div class="form-group" style="margin-bottom: 0;">
                <label>Dose / Ha *</label>
                <div class="input-group">
                    <input type="number" class="input-modern row-prod-dose" required step="0.1" min="0" value="${p ? p.dose_per_ha : ''}">
                    <select class="input-modern unit-select row-prod-dose-unit">
                        <option value="L" ${p && p.dose_unit === 'L' ? 'selected' : ''}>L</option>
                        <option value="mL" ${p && p.dose_unit === 'mL' ? 'selected' : ''}>mL</option>
                        <option value="g" ${p && p.dose_unit === 'g' ? 'selected' : ''}>g</option>
                        <option value="kg" ${p && p.dose_unit === 'kg' ? 'selected' : ''}>kg</option>
                    </select>
                </div>
            </div>
            <button type="button" class="btn-small-icon danger btn-remove-row" style="position: absolute; top: 12px; right: 12px; background: rgba(239, 68, 68, 0.1); border-radius: 50%;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        `;
        productsContainer.appendChild(row);

        row.querySelector('.btn-remove-row').addEventListener('click', () => {
            row.remove();
        });
    }

    btnAddProductRow.addEventListener('click', () => addProductRow());

    // Add Activity UI
    btnShowAddProduct.addEventListener('click', () => {
        document.getElementById('form-title').textContent = 'Manage Activity';
        document.getElementById('original-activity-name').value = '';
        productsContainer.innerHTML = '';
        addProductRow(); // Add 1 empty row
        masterDataListCard.style.display = 'none';
        masterDataFormCard.style.display = 'block';
    });

    btnCancelAddProduct.addEventListener('click', () => {
        masterDataFormCard.style.display = 'none';
        masterDataListCard.style.display = 'block';
        addProductForm.reset();
    });

    // Simple Auth (Password hardcoded to 'admin123' for simplicity)
    btnAuthVerify.addEventListener('click', () => {
        if (authPassword.value === 'admin123') {
            state.isAuthenticated = true;
            authError.style.display = 'none';
            authPassword.value = '';
            updateMasterDataView();
        } else {
            authError.style.display = 'block';
        }
    });

    // Edit and Delete Event Delegation
    productList.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-activity-btn');
        const delBtn = e.target.closest('.delete-activity-btn');

        if (editBtn) {
            const actName = editBtn.dataset.activity;
            const activityProducts = state.products.filter(p => (p.activity_name || 'Kegiatan Umum') === actName);
            
            if (activityProducts.length > 0) {
                document.getElementById('form-title').textContent = 'Manage Activity';
                document.getElementById('original-activity-name').value = actName;
                document.getElementById('prod-activity').value = actName;
                document.getElementById('prod-water').value = activityProducts[0].water_rate_per_ha;
                
                productsContainer.innerHTML = '';
                activityProducts.forEach(p => addProductRow(p));
                
                masterDataListCard.style.display = 'none';
                masterDataFormCard.style.display = 'block';
            }
        } else if (delBtn) {
            const actName = delBtn.dataset.activity;
            if (confirm(`Are you sure you want to delete activity "${actName}" and all its products?`)) {
                deleteActivityLocal(actName);
            }
        }
    });

    // Save Activity Form Submit
    addProductForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const originalName = document.getElementById('original-activity-name').value;
        const newActivityName = document.getElementById('prod-activity').value || 'Kegiatan Umum';
        const waterRate = parseFloat(document.getElementById('prod-water').value);
        
        const rows = document.querySelectorAll('.product-row');
        if (rows.length === 0) {
            showToast('Please add at least one product to the activity.', 'error');
            return;
        }

        const productsData = [];
        let isValid = true;

        rows.forEach(row => {
            const id = row.querySelector('.row-prod-id').value;
            const name = row.querySelector('.row-prod-name').value;
            const active = row.querySelector('.row-prod-active').value;
            const dose = parseFloat(row.querySelector('.row-prod-dose').value);
            const unit = row.querySelector('.row-prod-dose-unit').value;

            if (!name || isNaN(dose)) {
                isValid = false;
            }

            productsData.push({
                id: id || null,
                product_name: name,
                active_ingredients: active,
                dose_per_ha: dose,
                dose_unit: unit,
            });
        });

        if (!isValid) {
            showToast('Please fill all required product fields.', 'error');
            return;
        }
        
        saveActivity(originalName, newActivityName, waterRate, productsData);
        btnCancelAddProduct.click(); // Close form
    });

    // Custom Calc Unit Sync
    customDoseUnit.addEventListener('change', (e) => {
        customChemSuffix.textContent = e.target.value;
    });

    // --- Calculators Logic ---
    
    // Area Calc
    btnCalcArea.addEventListener('click', () => {
        const activityName = areaActivitySelect.value;
        const area = parseFloat(areaInput.value);
        
        if (!activityName || isNaN(area) || area <= 0) {
            showToast('Please select an activity and enter a valid area.', 'error');
            return;
        }

        const activityProducts = state.products.filter(p => (p.activity_name || 'Kegiatan Umum') === activityName);
        if (activityProducts.length > 0) {
            // Assume water rate is uniform for the activity, use the first product's water rate
            const waterRate = activityProducts[0].water_rate_per_ha;
            const totalWater = area * waterRate;
            
            areaResultWater.textContent = `${totalWater.toLocaleString(undefined, {maximumFractionDigits: 2})} L`;
            
            areaChemicalsList.innerHTML = '';
            activityProducts.forEach(p => {
                const totalChem = area * p.dose_per_ha;
                const box = document.createElement('div');
                box.className = 'result-box chemical-box';
                box.innerHTML = `
                    <span class="result-label">${p.product_name}</span>
                    <span class="result-value">${totalChem.toLocaleString(undefined, {maximumFractionDigits: 2})} ${p.dose_unit || 'L'}</span>
                `;
                areaChemicalsList.appendChild(box);
            });
            
            areaResultContainer.style.display = 'grid';
        }
    });

    // Custom Calc: Given Water
    btnCalcCustomWater.addEventListener('click', () => {
        const dose = parseFloat(customDose.value);
        const waterRate = parseFloat(customWaterRate.value);
        const water = parseFloat(customWaterInput.value);
        const unit = customDoseUnit.value;

        if (isNaN(dose) || isNaN(waterRate) || isNaN(water) || waterRate <= 0) {
            showToast('Please fill all fields with valid numbers.', 'error');
            return;
        }

        // Formula: Chemical = (Water / WaterRate) * Dose
        const chemicalNeeded = (water / waterRate) * dose;
        
        customResultLabel.textContent = 'You need to add';
        customResultValue.textContent = `${chemicalNeeded.toLocaleString(undefined, {maximumFractionDigits: 2})} ${unit}`;
        customResultContainer.style.display = 'grid';
    });

    // Custom Calc: Given Chemical
    btnCalcCustomChem.addEventListener('click', () => {
        const dose = parseFloat(customDose.value);
        const waterRate = parseFloat(customWaterRate.value);
        const chem = parseFloat(customChemInput.value);

        if (isNaN(dose) || isNaN(waterRate) || isNaN(chem) || dose <= 0) {
            showToast('Please fill all fields with valid numbers.', 'error');
            return;
        }

        // Formula: Water = (Chemical / Dose) * WaterRate
        const waterNeeded = (chem / dose) * waterRate;
        
        customResultLabel.textContent = 'You need to add';
        customResultValue.textContent = `${waterNeeded.toLocaleString(undefined, {maximumFractionDigits: 2})} L Water`;
        customResultContainer.style.display = 'grid';
    });
}

// Start
initApp();
