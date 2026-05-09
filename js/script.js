// Global State
let customers = JSON.parse(localStorage.getItem('qr_customers')) || [];
let qrcodeInstance = null;
let currentQRId = null;

// --- CLOUDINARY CONFIGURATION ---
// Replace these with your own details from Cloudinary dashboard
const CLOUDINARY_CLOUD_NAME = 'dhvcp6tiy';
const CLOUDINARY_UPLOAD_PRESET = 'demo qr';
// --------------------------------

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    initTheme();

    // Determine context based on DOM elements
    if (document.getElementById('customer-table-body')) {
        // Admin Dashboard
        renderTable();
        updateStats();
        setupImageUpload();
        renderPendingRequests();

        // Reset modal on close
        const customerModalEl = document.getElementById('customerModal');
        if (customerModalEl) {
            customerModalEl.addEventListener('hidden.bs.modal', event => {
                document.getElementById('customerForm').reset();
                document.getElementById('customerId').value = '';
                document.getElementById('custImageBase64').value = '';
                document.getElementById('modalTitle').innerText = 'Add Customer';
            });
        }
    } else if (document.getElementById('profileCard')) {
        // Customer Profile Page
        loadProfileData();
    } else if (document.getElementById('qrScanRegistrationForm')) {
        // Scan Page
        initScanPage();
    }
});

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    const toggleBtn = document.getElementById('theme-toggle');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeIcon(newTheme);
        });
    }
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('#theme-toggle i');
    if (icon) {
        icon.className = theme === 'dark' ? 'bi bi-sun-fill text-warning' : 'bi bi-moon-fill text-dark';
    }
}

// Sidebar Toggle
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
}

// Logout
function logout() {
    sessionStorage.removeItem('qrpro_admin_auth');
    window.location.href = 'admin-login.html';
}

// Image Upload Handling (Convert to Base64 AND Upload to Cloudinary)
function setupImageUpload() {
    const fileInput = document.getElementById('custImageFile');
    const uploadStatus = document.getElementById('uploadStatus');
    const uploadSuccess = document.getElementById('uploadSuccess');
    const saveBtn = document.querySelector('[onclick="saveCustomer()"]');

    if (fileInput) {
        fileInput.addEventListener('change', async function (e) {
            const file = e.target.files[0];
            if (!file) return;

            // 1. Local Preview (Base64)
            const reader = new FileReader();
            reader.onload = function (event) {
                document.getElementById('custImageBase64').value = event.target.result;
            };
            reader.readAsDataURL(file);

            // 2. Cloudinary Upload (for QR/Mobile)
            if (CLOUDINARY_CLOUD_NAME === 'YOUR_CLOUD_NAME') {
                console.warn("Cloudinary not configured. Image will only show locally.");
                return;
            }

            try {
                uploadStatus.style.display = 'block';
                uploadSuccess.style.display = 'none';
                saveBtn.disabled = true;

                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

                const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (data.secure_url) {
                    document.getElementById('custImageCloudinaryUrl').value = data.secure_url;
                    uploadStatus.style.display = 'none';
                    uploadSuccess.style.display = 'block';
                } else {
                    throw new Error("Upload failed");
                }
            } catch (err) {
                console.error("Cloudinary Error:", err);
                showToast('Cloudinary upload failed. Check your config!', 'danger');
                uploadStatus.style.display = 'none';
            } finally {
                saveBtn.disabled = false;
            }
        });
    }
}

// Generate Unique ID
function generateId() {
    return 'CUST-' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

// Save Customer (Handles both Add and Edit)
function saveCustomer() {
    const idField = document.getElementById('customerId').value;
    const name = document.getElementById('custName').value.trim();
    const company = document.getElementById('custCompany').value.trim();
    const mobile = document.getElementById('custMobile').value.trim();
    const email = document.getElementById('custEmail').value.trim();
    const address = document.getElementById('custAddress').value.trim();
    const notes = document.getElementById('custNotes').value.trim();
    const cloudinaryUrl = document.getElementById('custImageCloudinaryUrl').value;
    const imageBase64 = document.getElementById('custImageBase64').value;

    if (!name || !mobile) {
        showToast('Full Name and Mobile Number are required!', 'danger');
        return;
    }

    const customer = {
        id: idField || generateId(),
        name,
        company,
        mobile,
        email,
        address,
        notes,
        cloudinaryUrl,
        // Fallback hierarchy: 1. Cloudinary, 2. Base64, 3. UI Avatar
        image: cloudinaryUrl || imageBase64 || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&size=200`,
        timestamp: new Date().toISOString()
    };

    if (idField) {
        // Update existing
        const index = customers.findIndex(c => c.id === idField);
        if (index > -1) customers[index] = customer;
        showToast('Customer profile updated successfully!', 'success');
    } else {
        // Add new
        customers.push(customer);
        showToast('New customer added successfully!', 'success');
    }

    // Save to localStorage
    try {
        localStorage.setItem('qr_customers', JSON.stringify(customers));
    } catch (e) {
        // Handle QuotaExceededError (localStorage limit ~5MB)
        showToast('Storage full! Please clear some data or reduce image sizes.', 'danger');
        return;
    }

    // Reset and close modal
    bootstrap.Modal.getInstance(document.getElementById('customerModal')).hide();

    renderTable();
    updateStats();
}

// Render Table
function renderTable() {
    const tbody = document.getElementById('customer-table-body');
    if (!tbody) return;

    const searchTerm = document.getElementById('search-input').value.toLowerCase();

    tbody.innerHTML = '';

    // Sort by newest first
    const sortedCustomers = [...customers].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const filteredCustomers = sortedCustomers.filter(c =>
        c.name.toLowerCase().includes(searchTerm) ||
        c.id.toLowerCase().includes(searchTerm) ||
        c.company.toLowerCase().includes(searchTerm) ||
        c.mobile.includes(searchTerm)
    );

    if (filteredCustomers.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">No customers found.</td></tr>`;
        return;
    }

    filteredCustomers.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="badge bg-light text-dark border font-monospace">${c.id}</span></td>
            <td>
                <div class="d-flex align-items-center">
                    <img src="${c.image}" alt="${c.name}" class="rounded-circle me-3 shadow-sm" width="40" height="40" style="object-fit:cover;">
                    <div class="fw-semibold">${c.name}</div>
                </div>
            </td>
            <td>${c.company || '<span class="text-muted">-</span>'}</td>
            <td><i class="bi bi-telephone text-muted me-1"></i> ${c.mobile}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary rounded-pill px-3" onclick="showQR('${c.id}')"><i class="bi bi-qr-code-scan me-1"></i> QR Code</button>
            </td>
            <td>
                <div class="btn-group">
                    <button class="btn btn-sm btn-light border text-primary" onclick="editCustomer('${c.id}')" title="Edit"><i class="bi bi-pencil-fill"></i></button>
                    <button class="btn btn-sm btn-light border text-danger" onclick="deleteCustomer('${c.id}')" title="Delete"><i class="bi bi-trash-fill"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Update Dashboard Stats
function updateStats() {
    const el = document.getElementById('total-customers');
    if (el) el.innerText = customers.length;
    
    const pendingRequests = JSON.parse(localStorage.getItem('qr_pending_requests')) || [];
    const pendingEl = document.getElementById('pending-count-badge');
    if (pendingEl) pendingEl.innerText = pendingRequests.length;
}

// Edit Customer
function editCustomer(id) {
    const c = customers.find(x => x.id === id);
    if (!c) return;

    document.getElementById('customerId').value = c.id;
    document.getElementById('custName').value = c.name;
    document.getElementById('custCompany').value = c.company;
    document.getElementById('custMobile').value = c.mobile;
    document.getElementById('custEmail').value = c.email;
    document.getElementById('custAddress').value = c.address;
    document.getElementById('custNotes').value = c.notes;
    document.getElementById('custImageCloudinaryUrl').value = c.cloudinaryUrl || '';
    document.getElementById('custImageBase64').value = c.image && c.image.startsWith('data:image') ? c.image : '';

    // Reset status indicators
    document.getElementById('uploadStatus').style.display = 'none';
    document.getElementById('uploadSuccess').style.display = 'none';

    document.getElementById('modalTitle').innerText = 'Edit Customer Profile';
    new bootstrap.Modal(document.getElementById('customerModal')).show();
}

// Delete Customer
function deleteCustomer(id) {
    if (confirm('Are you sure you want to permanently delete this customer?')) {
        customers = customers.filter(x => x.id !== id);
        localStorage.setItem('qr_customers', JSON.stringify(customers));
        renderTable();
        updateStats();
        showToast('Customer deleted successfully.', 'warning text-dark');
    }
}

// QR Code Functionality
function showQR(id) {
    currentQRId = id;
    const customer = customers.find(c => c.id === id);
    if (!customer) return;

    const qrContainer = document.getElementById('qrcode-display');
    qrContainer.innerHTML = '';

    const currentUrl = window.location.href.split('/').slice(0, -1).join('/');

    // To make this work on mobile (which doesn't have the data in its localStorage),
    // we encode the customer details directly into the URL.
    // Note: We exclude large base64 images to keep the QR code scan-friendly.
    const compactData = {
        i: customer.id,
        n: customer.name,
        c: customer.company,
        m: customer.mobile,
        e: customer.email,
        a: customer.address,
        nt: customer.notes
    };

    // Only include the image if it's a hosted URL
    if (customer.cloudinaryUrl) {
        compactData.img = customer.cloudinaryUrl;
    } else if (customer.image && !customer.image.startsWith('data:image')) {
        compactData.img = customer.image;
    }

    const encodedData = btoa(unescape(encodeURIComponent(JSON.stringify(compactData))));
    const profileUrl = `${currentUrl}/profile.html?data=${encodedData}`;

    qrcodeInstance = new QRCode(qrContainer, {
        text: profileUrl,
        width: 240, // Slightly larger for more data
        height: 240,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M // Medium error correction to fit data
    });

    document.getElementById('qrProfileLink').href = profileUrl;
    new bootstrap.Modal(document.getElementById('qrModal')).show();
}

function downloadQR() {
    const qrImg = document.querySelector('#qrcode-display img');
    if (qrImg) {
        const link = document.createElement('a');
        link.download = `QR_${currentQRId}.png`;
        link.href = qrImg.src;
        link.click();
        showToast('QR Code downloaded successfully!');
    }
}

function printQR() {
    const qrImg = document.querySelector('#qrcode-display img');
    if (qrImg) {
        const brandName = "QR Pro"; 

        const printWindow = window.open('', '', 'height=700,width=800');
        printWindow.document.write('<html><head><title>Print QR Code</title>');
        printWindow.document.write(`
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
                body {
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    background-color: #fff;
                    color: #1a1f36;
                }
                .print-container {
                    padding: 40px;
                    text-align: center;
                    max-width: 400px;
                    width: 100%;
                }
                h2 { 
                    font-weight: 800; 
                    font-size: 1.5rem; 
                    margin-bottom: 30px;
                    color: #1a1f36;
                }
                .qr-wrapper {
                    background: #fff;
                    padding: 20px;
                    border-radius: 24px;
                    border: 1px solid #eee;
                    display: inline-block;
                    margin-bottom: 20px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.03);
                }
                img { 
                    width: 280px; 
                    height: 280px; 
                    display: block;
                }
                .details {
                    margin-top: 10px;
                }
                .id-text { 
                    font-weight: 600; 
                    color: #6b7280; 
                    font-size: 0.95rem; 
                    font-family: monospace;
                    background: #f8fafc;
                    padding: 4px 12px;
                    border-radius: 8px;
                    display: inline-block;
                    margin-bottom: 8px;
                }
                .brand-footer { 
                    margin-top: 30px; 
                    padding-top: 20px; 
                    border-top: 1px dashed #e2e8f0; 
                }
                .brand-name { 
                    font-weight: 800; 
                    font-size: 1.4rem; 
                    color: #6366f1; /* Use solid color for print reliability */
                    margin-bottom: 4px;
                }
                .tagline {
                    font-size: 0.75rem;
                    color: #94a3b8;
                    font-weight: 600;
                    letter-spacing: 0.05em;
                    text-transform: uppercase;
                }
                @media print {
                    body { height: auto; }
                    .print-container { box-shadow: none; border: none; }
                }
            </style>
        `);
        printWindow.document.write('</head><body>');
        printWindow.document.write('<div class="print-container">');
        printWindow.document.write('<h2>Scan QR for Details</h2>');
        printWindow.document.write('<div class="qr-wrapper">');
        printWindow.document.write(`<img src="${qrImg.src}" />`);
        printWindow.document.write('</div>');
        
        printWindow.document.write('<div class="details">');
        printWindow.document.write(`<div class="id-text">ID: ${currentQRId}</div>`);
        
        printWindow.document.write('<div class="brand-footer">');
        printWindow.document.write(`<div class="brand-name">${brandName}</div>`);
        printWindow.document.write('<div class="tagline">Smart Customer Management</div>');
        printWindow.document.write('</div>');
        
        printWindow.document.write('</div>');
        printWindow.document.write('</div>');
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 800);
    }
}

function printBlankQR() {
    // Generate a unique ID for the new blank QR
    const blankId = 'QR-' + Math.random().toString(36).substr(2, 6).toUpperCase();
    
    // Get the base URL
    const currentUrl = window.location.href.split('/').slice(0, -1).join('/');
    const scanUrl = `${currentUrl}/scan.html?id=${blankId}`;

    // Create a temporary hidden div to generate the QR code
    const tempDiv = document.createElement('div');
    tempDiv.style.display = 'none';
    document.body.appendChild(tempDiv);

    new QRCode(tempDiv, {
        text: scanUrl,
        width: 240,
        height: 240,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
    });

    // Wait for the QR code image to be generated, then open print window
    setTimeout(() => {
        const qrImg = tempDiv.querySelector('img');
        if (qrImg) {
            const brandName = "QR Pro"; 

            const printWindow = window.open('', '', 'height=700,width=800');
            printWindow.document.write('<html><head><title>Print Blank QR Code</title>');
            printWindow.document.write(`
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
                    body {
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                        align-items: center;
                        min-height: 100vh;
                        margin: 0;
                        font-family: 'Plus Jakarta Sans', sans-serif;
                        background-color: #fff;
                        color: #1a1f36;
                    }
                    .print-container {
                        padding: 40px;
                        text-align: center;
                        max-width: 400px;
                        width: 100%;
                    }
                    h2 { 
                        font-weight: 800; 
                        font-size: 1.5rem; 
                        margin-bottom: 30px;
                        color: #1a1f36;
                    }
                    .qr-wrapper {
                        background: #fff;
                        padding: 20px;
                        border-radius: 24px;
                        border: 1px solid #eee;
                        display: inline-block;
                        margin-bottom: 20px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.03);
                    }
                    img { 
                        width: 280px; 
                        height: 280px; 
                        display: block;
                    }
                    .details {
                        margin-top: 10px;
                    }
                    .id-text { 
                        font-weight: 600; 
                        color: #6b7280; 
                        font-size: 0.95rem; 
                        font-family: monospace;
                        background: #f8fafc;
                        padding: 4px 12px;
                        border-radius: 8px;
                        display: inline-block;
                        margin-bottom: 8px;
                    }
                    .brand-footer { 
                        margin-top: 30px; 
                        padding-top: 20px; 
                        border-top: 1px dashed #e2e8f0; 
                    }
                    .brand-name { 
                        font-weight: 800; 
                        font-size: 1.4rem; 
                        color: #6366f1;
                        margin-bottom: 4px;
                    }
                    .tagline {
                        font-size: 0.75rem;
                        color: #94a3b8;
                        font-weight: 600;
                        letter-spacing: 0.05em;
                        text-transform: uppercase;
                    }
                    @media print {
                        body { height: auto; }
                        .print-container { box-shadow: none; border: none; }
                    }
                </style>
            `);
            printWindow.document.write('</head><body>');
            printWindow.document.write('<div class="print-container">');
            printWindow.document.write('<h2>Scan to Register Profile</h2>');
            printWindow.document.write('<div class="qr-wrapper">');
            printWindow.document.write(`<img src="${qrImg.src}" />`);
            printWindow.document.write('</div>');
            
            printWindow.document.write('<div class="details">');
            printWindow.document.write(`<div class="id-text">Unclaimed ID: ${blankId}</div>`);
            
            printWindow.document.write('<div class="brand-footer">');
            printWindow.document.write(`<div class="brand-name">${brandName}</div>`);
            printWindow.document.write('<div class="tagline">Smart Customer Management</div>');
            printWindow.document.write('</div>');
            
            printWindow.document.write('</div>');
            printWindow.document.write('</div>');
            printWindow.document.write('</body></html>');
            printWindow.document.close();
            printWindow.focus();
            
            // Allow the window to render completely before printing
            setTimeout(() => {
                printWindow.print();
                printWindow.close();
                document.body.removeChild(tempDiv);
            }, 800);
        } else {
            document.body.removeChild(tempDiv);
            alert("Error generating QR code. Please try again.");
        }
    }, 100); // 100ms delay to ensure QRCode.js has populated the img tag
}

// Data Import / Export (JSON)
function exportData() {
    if (customers.length === 0) {
        showToast('No data to export!', 'warning text-dark');
        return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(customers, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `customers_backup_${new Date().toISOString().split('T')[0]}.json`);
    dlAnchorElem.click();
    showToast('Customer data exported successfully!');
}

function importData(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const imported = JSON.parse(e.target.result);
                if (Array.isArray(imported)) {
                    // Merge or Replace? Let's replace for simplicity
                    customers = imported;
                    localStorage.setItem('qr_customers', JSON.stringify(customers));
                    renderTable();
                    updateStats();
                    showToast('Data imported successfully!');
                } else {
                    showToast('Invalid JSON file format!', 'danger');
                }
            } catch (err) {
                showToast('Error parsing file!', 'danger');
            }
        };
        reader.readAsText(file);
    }
    event.target.value = ''; // reset input
}

// ----------------------------------------------------
// Profile Page Logic
// ----------------------------------------------------
function loadProfileData() {
    const params = new URLSearchParams(window.location.search);
    const dataParam = params.get('data');
    let customer = null;

    // First, try to get data encoded in the URL (for mobile scanners)
    if (dataParam) {
        try {
            const decoded = JSON.parse(decodeURIComponent(escape(atob(dataParam))));
            customer = {
                id: decoded.i,
                name: decoded.n,
                company: decoded.c,
                mobile: decoded.m,
                email: decoded.e,
                address: decoded.a,
                notes: decoded.nt,
                image: decoded.img || `https://ui-avatars.com/api/?name=${encodeURIComponent(decoded.n)}&background=random&color=fff&size=200`
            };
        } catch (e) {
            console.error("Failed to decode QR data:", e);
        }
    }

    // If no URL data, fallback to searching localStorage (for admin preview)
    if (!customer) {
        const id = params.get('id');
        customer = customers.find(c => c.id === id);
    }

    if (customer) {
        document.getElementById('profileCard').style.display = 'block';

        document.title = `${customer.name} — Digital Card`;
        document.getElementById('p-img').src = customer.image;
        document.getElementById('p-name').innerText = customer.name;

        const companyEl = document.getElementById('p-company');
        if (customer.company) {
            companyEl.innerText = customer.company;
            companyEl.style.display = 'inline-block';
        } else {
            companyEl.style.display = 'none';
        }

        // Phone
        document.getElementById('p-mobile').innerText = customer.mobile;
        document.getElementById('link-mobile').href = `tel:${customer.mobile}`;

        // Email
        if (customer.email) {
            document.getElementById('p-email').innerText = customer.email;
            document.getElementById('link-email').href = `mailto:${customer.email}`;
        } else {
            document.getElementById('p-email').innerText = 'Not provided';
            document.getElementById('link-email').style.pointerEvents = 'none';
        }

        // Address
        document.getElementById('p-address').innerText = customer.address || 'Not provided';

        // Notes
        if (customer.notes) {
            document.getElementById('notes-container').style.display = 'block';
            document.getElementById('p-notes').innerText = customer.notes;
        }
    } else {
        document.getElementById('errorCard').style.display = 'block';
    }
}

function shareProfile() {
    if (navigator.share) {
        navigator.share({
            title: document.title,
            text: 'Check out my digital profile!',
            url: window.location.href
        }).catch(console.error);
    } else {
        navigator.clipboard.writeText(window.location.href)
            .then(() => alert('Profile link copied to clipboard!'))
            .catch(err => console.error('Could not copy text: ', err));
    }
}

function saveContact() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const customer = customers.find(c => c.id === id);
    if (!customer) return;

    // Generate vCard format
    let vcard = `BEGIN:VCARD\nVERSION:3.0\nN:;${customer.name};;;\nFN:${customer.name}\n`;
    if (customer.company) vcard += `ORG:${customer.company}\n`;
    if (customer.mobile) vcard += `TEL;TYPE=CELL:${customer.mobile}\n`;
    if (customer.email) vcard += `EMAIL:${customer.email}\n`;
    if (customer.address) vcard += `ADR;TYPE=WORK,PREF:;;${customer.address.replace(/\n/g, ' ')};;;;\n`;
    if (customer.notes) vcard += `NOTE:${customer.notes.replace(/\n/g, ' ')}\n`;
    vcard += `END:VCARD`;

    const blob = new Blob([vcard], { type: "text/vcard" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${customer.name.replace(/\s+/g, '_')}.vcf`;
    link.click();
    URL.revokeObjectURL(url);
}

// ----------------------------------------------------
// UI Utilities
// ----------------------------------------------------
function showToast(message, bgClass = 'success') {
    const toastEl = document.getElementById('liveToast');
    if (!toastEl) return;

    // bg-success, bg-danger, bg-warning etc
    document.getElementById('toastMessage').innerText = message;

    // Reset classes
    toastEl.className = `toast align-items-center border-0 shadow glass-card text-bg-${bgClass.split(' ')[0]}`;

    // If it's warning, make text dark for readability
    if (bgClass.includes('text-dark')) {
        toastEl.classList.add('text-dark');
        const btnClose = toastEl.querySelector('.btn-close');
        if (btnClose) btnClose.classList.remove('btn-close-white');
    } else {
        const btnClose = toastEl.querySelector('.btn-close');
        if (btnClose) btnClose.classList.add('btn-close-white');
    }

    const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
    toast.show();
}
// --- CUSTOMER REQUEST HANDLING (INDEX PAGE) ---
function handleQRRequest(event) {
    event.preventDefault();
    
    const requestData = {
        id: 'REQ-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
        name: document.getElementById('reqName').value,
        email: document.getElementById('reqEmail').value,
        mobile: document.getElementById('reqMobile').value,
        company: document.getElementById('reqCompany').value || '',
        notes: document.getElementById('reqNotes').value || '',
        image: document.getElementById('reqImageBase64').value || '',
        cloudinaryUrl: document.getElementById('reqImageCloudinaryUrl').value || '',
        timestamp: new Date().toISOString(),
        status: 'pending'
    };

    let pendingRequests = JSON.parse(localStorage.getItem('qr_pending_requests')) || [];
    pendingRequests.push(requestData);
    localStorage.setItem('qr_pending_requests', JSON.stringify(pendingRequests));

    // UI Transition
    document.getElementById('qrRequestForm').style.display = 'none';
    document.getElementById('requestSuccess').style.display = 'block';
    
    // Optional: Smooth scroll back to success message top
    document.getElementById('get-qr').scrollIntoView({ behavior: 'smooth' });
}

// --- ADMIN REQUEST MANAGEMENT ---
function renderPendingRequests() {
    const container = document.getElementById('pending-requests-container');
    if (!container) return;

    const pendingRequests = JSON.parse(localStorage.getItem('qr_pending_requests')) || [];
    const countBadge = document.getElementById('pending-count-badge');
    if (countBadge) countBadge.innerText = pendingRequests.length;

    if (pendingRequests.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5">
                <i class="bi bi-clipboard-check text-muted fs-1"></i>
                <p class="text-muted mt-2">No pending verification requests.</p>
            </div>
        `;
        return;
    }

    let html = `
        <div class="table-responsive">
            <table class="table table-hover align-middle">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Customer</th>
                        <th>Contact</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
    `;

    pendingRequests.forEach(req => {
        const date = new Date(req.timestamp).toLocaleDateString();
        html += `
            <tr>
                <td class="small text-muted">${date}</td>
                <td>
                    <div class="d-flex align-items-center">
                        <img src="${req.image || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(req.name)}" class="rounded-circle me-3 border shadow-sm" width="40" height="40" style="object-fit:cover;">
                        <div>
                            <div class="fw-bold">${req.name}</div>
                            <div class="small text-muted">${req.company || 'No Company'}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="small"><i class="bi bi-envelope me-1"></i>${req.email}</div>
                    <div class="small"><i class="bi bi-phone me-1"></i>${req.mobile}</div>
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-success" onclick="approveRequest('${req.id}')" title="Approve & Generate QR">
                            <i class="bi bi-check-lg"></i> Verify
                        </button>
                        <button class="btn btn-outline-danger" onclick="rejectRequest('${req.id}')" title="Reject">
                            <i class="bi bi-x-lg"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function approveRequest(reqId) {
    let pendingRequests = JSON.parse(localStorage.getItem('qr_pending_requests')) || [];
    const reqIndex = pendingRequests.findIndex(r => r.id === reqId);
    
    if (reqIndex > -1) {
        const req = pendingRequests[reqIndex];
        
        // Create new customer from request
        const newCustomer = {
            id: 'CUST-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
            name: req.name,
            company: req.company,
            mobile: req.mobile,
            email: req.email,
            address: '',
            notes: req.notes,
            cloudinaryUrl: req.cloudinaryUrl || '',
            image: req.cloudinaryUrl || req.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(req.name)}&background=random&color=fff&size=200`
        };

        customers.push(newCustomer);
        localStorage.setItem('qr_customers', JSON.stringify(customers));
        
        // Remove from pending
        pendingRequests.splice(reqIndex, 1);
        localStorage.setItem('qr_pending_requests', JSON.stringify(pendingRequests));
        
        showToast('Request verified! Customer added to directory.', 'success');
        renderTable();
        updateStats();
        renderPendingRequests();
    }
}

function rejectRequest(reqId) {
    if (confirm('Are you sure you want to reject this request?')) {
        let pendingRequests = JSON.parse(localStorage.getItem('qr_pending_requests')) || [];
        pendingRequests = pendingRequests.filter(r => r.id !== reqId);
        localStorage.setItem('qr_pending_requests', JSON.stringify(pendingRequests));
        
        showToast('Request rejected.', 'info');
        renderPendingRequests();
    }
}

// Preview image for request form (Handles Base64 AND Cloudinary Upload)
async function previewReqImage(input) {
    const file = input.files[0];
    if (!file) return;

    const uploadStatus = document.getElementById('reqUploadStatus');
    const uploadSuccess = document.getElementById('reqUploadSuccess');
    const submitBtn = document.querySelector('button[type="submit"]');

    // 1. Local Preview (Base64)
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('reqImagePreview').src = e.target.result;
        document.getElementById('reqImageBase64').value = e.target.result;
        document.getElementById('imagePreviewContainer').style.display = 'block';
        document.getElementById('uploadPrompt').style.display = 'none';
    };
    reader.readAsDataURL(file);

    // 2. Cloudinary Upload
    if (CLOUDINARY_CLOUD_NAME === 'YOUR_CLOUD_NAME' || !CLOUDINARY_CLOUD_NAME) {
        console.warn("Cloudinary not configured for user requests.");
        return;
    }

    try {
        if (uploadStatus) uploadStatus.style.display = 'block';
        if (uploadSuccess) uploadSuccess.style.display = 'none';
        if (submitBtn) submitBtn.disabled = true;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.secure_url) {
            document.getElementById('reqImageCloudinaryUrl').value = data.secure_url;
            if (uploadStatus) uploadStatus.style.display = 'none';
            if (uploadSuccess) uploadSuccess.style.display = 'block';
        } else {
            throw new Error("Upload failed");
        }
    } catch (err) {
        console.error("Cloudinary Request Error:", err);
        if (uploadStatus) uploadStatus.style.display = 'none';
        alert("Image cloud upload failed. Profile may show a default avatar when scanned.");
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}

// --- DYNAMIC REUSABLE QR SCAN LOGIC ---
function initScanPage() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    if (!id) {
        document.getElementById('loader').classList.add('d-none');
        document.getElementById('error-message').classList.remove('d-none');
        document.getElementById('form-section').classList.remove('d-none');
        return;
    }

    // Check if profile exists
    const customer = customers.find(c => c.id === id);

    if (customer) {
        // Data exists! Redirect to profile page
        window.location.href = `profile.html?id=${id}`;
    } else {
        // No data exists, show registration form
        document.getElementById('loader').classList.add('d-none');
        document.getElementById('navbar').classList.remove('d-none');
        document.getElementById('hero-section').classList.remove('d-none');
        document.getElementById('form-section').classList.remove('d-none');
        document.getElementById('footer').classList.remove('d-none');
        document.getElementById('scanQrId').value = id;
    }
}

function handleScanRegistration(event) {
    event.preventDefault();
    
    const id = document.getElementById('scanQrId').value;
    const name = document.getElementById('scanName').value.trim();
    
    if (!id || !name) {
        showToast('ID and Name are required!', 'danger');
        return;
    }

    const cloudinaryUrl = document.getElementById('scanImageCloudinaryUrl').value;
    const imageBase64 = document.getElementById('scanImageBase64').value;
    
    const newCustomer = {
        id: id,
        name: name,
        email: document.getElementById('scanEmail').value.trim(),
        mobile: document.getElementById('scanMobile').value.trim(),
        company: document.getElementById('scanCompany').value.trim(),
        address: document.getElementById('scanAddress').value.trim(),
        notes: document.getElementById('scanNotes').value.trim(),
        cloudinaryUrl: cloudinaryUrl,
        image: cloudinaryUrl || imageBase64 || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&size=200`,
        timestamp: new Date().toISOString()
    };

    customers.push(newCustomer);
    
    try {
        localStorage.setItem('qr_customers', JSON.stringify(customers));
        // Redirect to their new profile!
        window.location.href = `profile.html?id=${id}`;
    } catch (e) {
        showToast('Storage full! Please reduce image size.', 'danger');
    }
}

async function previewScanImage(input) {
    const file = input.files[0];
    if (!file) return;

    const uploadStatus = document.getElementById('scanUploadStatus');
    const uploadSuccess = document.getElementById('scanUploadSuccess');
    const submitBtn = document.getElementById('scanSubmitBtn');

    // 1. Local Preview (Base64)
    const reader = new FileReader();
    reader.onload = function(e) {
        document.getElementById('scanImagePreview').src = e.target.result;
        document.getElementById('scanImageBase64').value = e.target.result;
        document.getElementById('scanImagePreviewContainer').style.display = 'block';
        document.getElementById('scanUploadPrompt').style.display = 'none';
    };
    reader.readAsDataURL(file);

    // 2. Cloudinary Upload
    if (CLOUDINARY_CLOUD_NAME === 'YOUR_CLOUD_NAME' || !CLOUDINARY_CLOUD_NAME) {
        return;
    }

    try {
        if (uploadStatus) uploadStatus.style.display = 'block';
        if (uploadSuccess) uploadSuccess.style.display = 'none';
        if (submitBtn) submitBtn.disabled = true;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.secure_url) {
            document.getElementById('scanImageCloudinaryUrl').value = data.secure_url;
            if (uploadStatus) uploadStatus.style.display = 'none';
            if (uploadSuccess) uploadSuccess.style.display = 'block';
        } else {
            throw new Error("Upload failed");
        }
    } catch (err) {
        console.error("Cloudinary Request Error:", err);
        if (uploadStatus) uploadStatus.style.display = 'none';
        alert("Image cloud upload failed. Profile may show a default avatar.");
    } finally {
        if (submitBtn) submitBtn.disabled = false;
    }
}
