// 1. FIREBASE CONFIGURATION (Paste yours here)
const firebaseConfig = {
  apiKey: "AIzaSyBea2wRb8tVtUSGXSHMD7KJLAclGrWWEiY",
  authDomain: "tourtrackerapp-7e38d.firebaseapp.com",
  projectId: "tourtrackerapp-7e38d",
  storageBucket: "tourtrackerapp-7e38d.firebasestorage.app",
  messagingSenderId: "170612644740",
  appId: "1:170612644740:web:bc2498152582522f0a1bd1",
  measurementId: "G-6GTPSF5GWH"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Global Variables
let currentTourId = null;
let perMemberBaseAmount = 0;
let totalTourBudget = 0;
let currentTotalExpenses = 0; 
let globalSponsorAmount = 0;  
let membersPdfData = [];
let expensesPdfData = [];

$(document).ready(function() {

    // --- MOBILE TABS LOGIC ---
    $('.tab-btn').click(function() {
        $('.tab-btn').removeClass('active');
        $(this).addClass('active');
        $('.panel').removeClass('active-panel');
        let targetPanel = $(this).attr('data-target');
        $('#' + targetPanel).addClass('active-panel');
    });

    // --- LOAD EXISTING TOURS ON STARTUP ---
    db.collection("tours").orderBy("createdAt", "desc").get().then((snapshot) => {
        snapshot.forEach((doc) => {
            let data = doc.data();
            $('#existingToursDropdown').append(`<option value="${doc.id}">${data.name}</option>`);
        });
    });

    $('#loadTourBtn').click(function() {
        let selectedId = $('#existingToursDropdown').val();
        if(!selectedId) return alert("Please select a tour to load.");
        loadTourDashboard(selectedId);
    });

    // --- CREATE NEW TOUR ---
    $('#createTourForm').submit(function(e) {
        e.preventDefault();
        const btn = $(this).find('button[type="submit"]');
        btn.text('Creating...').prop('disabled', true);
        
        const tourData = {
            name: $('#tourName').val(),
            membersCount: parseInt($('#tourMembers').val()),
            baseAmount: parseFloat($('#tourAmount').val()),
            sponsorAmount: 0, 
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        db.collection("tours").add(tourData).then((docRef) => {
            loadTourDashboard(docRef.id);
        }).catch(err => {
            console.error(err);
            alert("Database Error: Check Firebase Rules");
            btn.text('Start New Tracker').prop('disabled', false);
        });
    });

    // --- THE DASHBOARD LOADER ---
    function loadTourDashboard(tourId) {
        currentTourId = tourId;
        $('#setup-screen').removeClass('active');
        $('#dashboard-screen').addClass('active');

        // REAL-TIME Listener for the Tour Document (Watches for Sponsor Amount changes)
        db.collection("tours").doc(tourId).onSnapshot((doc) => {
            let tourData = doc.data();
            perMemberBaseAmount = tourData.baseAmount;
            globalSponsorAmount = tourData.sponsorAmount || 0;
            
            // Calculate total budget: (Members * Base) + Sponsor
            totalTourBudget = (tourData.membersCount * tourData.baseAmount) + globalSponsorAmount;
            
            // Update UI Dashboards
            $('#displayTourName').text(tourData.name);
            $('#calcTotalBudget').text(`₹${totalTourBudget}`);
            $('#calcOverallBalance').text(`₹${(totalTourBudget - currentTotalExpenses).toFixed(2)}`);

            renderSponsorUI();
        });
        
        listenToMembers();
        listenToExpenses();
    }

    // --- ADD / UPDATE SQUAD MEMBER ---
    $('#addMemberForm').submit(function(e) {
        e.preventDefault();
        let editId = $('#editMemberId').val();
        let advancePaid = parseFloat($('#memberAdvance').val());
        let memberData = {
            name: $('#memberName').val(),
            amount: perMemberBaseAmount, 
            advance: advancePaid,
            balance: perMemberBaseAmount - advancePaid,
            isPaid: advancePaid >= perMemberBaseAmount
        };
        if (editId) db.collection(`tours/${currentTourId}/members`).doc(editId).update(memberData).then(resetMemberForm);
        else db.collection(`tours/${currentTourId}/members`).add(memberData).then(resetMemberForm);
    });

    // --- CONDITIONAL REQUIRED FOR "OTHERS" ---
    $('#expCategory').change(function() {
        if ($(this).val() === 'Others') $('#expDesc').prop('required', true).attr('placeholder', 'Comments (Required)*');
        else $('#expDesc').prop('required', false).attr('placeholder', 'Comments (Optional)');
    });

    // --- ADD / UPDATE EXPENSE ---
    $('#addExpenseForm').submit(function(e) {
        e.preventDefault();
        let editId = $('#editExpenseId').val();
        let expData = {
            category: $('#expCategory').val(),
            desc: $('#expDesc').val() || "-",
            date: $('#expDate').val(),
            amount: parseFloat($('#expAmount').val())
        };
        if(editId) db.collection(`tours/${currentTourId}/expenses`).doc(editId).update(expData).then(resetExpenseForm);
        else db.collection(`tours/${currentTourId}/expenses`).add(expData).then(resetExpenseForm);
    });

// --- PDF DOWNLOADS ---
    $('#downloadMembersPdf').click(function() {
        const { jsPDF } = window.jspdf; 
        const doc = new jsPDF();
        const tourName = $('#displayTourName').text();

        // Add Tour Name Header
        doc.setFontSize(18);
        doc.text(`${tourName} - Squad Contributions`, 14, 20);

        doc.autoTable({ 
            startY: 30, 
            head: [['Squad', 'Amount', 'Advance', 'Balance']], 
            body: membersPdfData, 
            theme: 'grid', 
            headStyles: { fillColor: [15, 23, 42] } 
        });
        doc.save('Squad_Balances.pdf');
    });

    $('#downloadExpensesPdf').click(function() {
        const { jsPDF } = window.jspdf; 
        const doc = new jsPDF();
        const tourName = $('#displayTourName').text();

        // 1. Add Tour Name Header
        doc.setFontSize(18);
        doc.text(`${tourName} - Tour Expenses Ledger`, 14, 20);

        // 2. Add Top Summary
        doc.setFontSize(11);
        doc.setTextColor(71, 85, 105); 
        
        let safeBudget = $('#calcTotalBudget').text().replace('₹', 'Rs. ');
        let safeExpenses = $('#calcTotalExpenses').text().replace('₹', 'Rs. ');
        let safeBalance = $('#calcOverallBalance').text().replace('₹', 'Rs. ');

        // Use a dynamic Y-coordinate so we can easily push lines down
        let currentY = 30;

        doc.text(`Total Budget: ${safeBudget}`, 14, currentY);
        currentY += 6; // Move down 6px for the next line

        // NEW: Conditionally add the Sponsor line if it exists
        if (globalSponsorAmount > 0) {
            doc.setTextColor(16, 185, 129); // Make the sponsor text a nice green color
            doc.text(`Includes Sponsor / Extra Funds: Rs. ${globalSponsorAmount}`, 14, currentY);
            currentY += 6; 
            doc.setTextColor(71, 85, 105); // Reset text color back to slate gray
        }

        doc.text(`Total Expenses: ${safeExpenses}`, 14, currentY);
        currentY += 6;
        
        doc.setFont(undefined, 'bold');
        doc.setTextColor(15, 23, 42); 
        doc.text(`Overall Balance: ${safeBalance}`, 14, currentY);

        // 3. Generate Table
        doc.autoTable({ 
            startY: currentY + 8, // Dynamically start the table 8px below the last line of text
            head: [['Category', 'Comments', 'Date', 'Amount']], 
            body: expensesPdfData, 
            foot: [['', '', 'Total Expenses:', `Rs. ${currentTotalExpenses.toFixed(2)}`]],
            theme: 'striped', 
            headStyles: { fillColor: [15, 23, 42] },
            footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' }
        });
        
        doc.save('Tour_Expenses.pdf');
    });

}); 

// --- REAL-TIME LISTENERS ---
function listenToMembers() {
    db.collection(`tours/${currentTourId}/members`).onSnapshot((snapshot) => {
        let tbody = ''; let totBase = 0, totAdv = 0, totBal = 0;
        membersPdfData = []; 
        snapshot.forEach((doc) => {
            const d = doc.data(); const id = doc.id;
            totBase += d.amount; totAdv += d.advance; totBal += d.balance;
            membersPdfData.push([d.name, `Rs. ${d.amount}`, `Rs. ${d.advance}`, `Rs. ${d.balance}`]);
            const checkedStatus = d.isPaid ? 'checked disabled' : 'disabled';
            tbody += `
                <tr>
                    <td data-label="Squad">${d.name}</td>
                    <td data-label="Amount">₹${d.amount}</td>
                    <td data-label="Fully Paid"><input type="checkbox" ${checkedStatus}></td>
                    <td data-label="Advance Paid">₹${d.advance}</td>
                    <td data-label="Balance">₹${d.balance}</td>
                    <td data-label="Action">
                        <button class="btn-edit" onclick="triggerEditMember('${id}', '${d.name}', '${d.advance}')">✎ Edit</button>
                        <button class="btn-del" onclick="deleteRecord('members', '${id}')">X</button>
                    </td>
                </tr>
            `;
        });
        $('#membersTable tbody').html(tbody);
        $('#totBase').text(totBase); $('#totAdv').text(totAdv); $('#totBal').text(totBal);
    });
}

function listenToExpenses() {
    db.collection(`tours/${currentTourId}/expenses`).orderBy('date', 'asc').onSnapshot((snapshot) => {
        let tbody = ''; currentTotalExpenses = 0;
        expensesPdfData = []; 
        snapshot.forEach((doc) => {
            const d = doc.data(); const id = doc.id;
            currentTotalExpenses += d.amount;
            expensesPdfData.push([d.category, d.desc, d.date, `Rs. ${d.amount.toFixed(2)}`]);
            tbody += `
                <tr>
                    <td data-label="Category">${d.category}</td>
                    <td data-label="Comments">${d.desc}</td>
                    <td data-label="Date">${d.date}</td>
                    <td data-label="Amount">₹${d.amount.toFixed(2)}</td>
                    <td data-label="Action">
                        <button class="btn-edit" onclick="triggerEditExpense('${id}', '${d.category}', '${d.desc}', '${d.date}', '${d.amount}')">✎ Edit</button>
                        <button class="btn-del" onclick="deleteRecord('expenses', '${id}')">X</button>
                    </td>
                </tr>
            `;
        });
        $('#expensesTable tbody').html(tbody);
        $('#totExp').text(`₹${currentTotalExpenses.toFixed(2)}`);
        $('#calcTotalExpenses').text(`₹${currentTotalExpenses.toFixed(2)}`);
        $('#calcOverallBalance').text(`₹${(totalTourBudget - currentTotalExpenses).toFixed(2)}`);
    });
}

// --- SPONSOR / CUSTOM FUNDS LOGIC ---
window.renderSponsorUI = function() {
    if (globalSponsorAmount > 0) {
        // Only one exists, show Edit/Delete state
        $('#sponsor-section').html(`
            <div class="sponsor-display">
                <span><span style="font-size:18px;">🎉</span> <strong>Sponsor / Extra Funds:</strong> ₹${globalSponsorAmount}</span>
                <div>
                    <button class="btn-edit" onclick="triggerEditSponsor()">✎ Edit</button>
                    <button class="btn-del" onclick="deleteSponsor()">X</button>
                </div>
            </div>
        `);
    } else {
        // Show Add state
        $('#sponsor-section').html(`
            <form class="sponsor-form" onsubmit="saveSponsor(event)">
                <input type="number" id="sponsorInput" placeholder="Add Sponsor / Extra Funds (₹)" required>
                <button type="submit" class="btn-success" style="padding: 10px 20px;">Add Amount</button>
            </form>
        `);
    }
};

window.saveSponsor = function(e) {
    e.preventDefault();
    let amt = parseFloat($('#sponsorInput').val());
    db.collection("tours").doc(currentTourId).update({ sponsorAmount: amt });
};

window.triggerEditSponsor = function() {
    $('#sponsor-section').html(`
        <form class="sponsor-form" onsubmit="saveSponsor(event)">
            <input type="number" id="sponsorInput" value="${globalSponsorAmount}" required>
            <button type="submit" class="btn-success" style="padding: 10px 20px;">Update</button>
            <button type="button" class="btn-secondary" onclick="renderSponsorUI()" style="padding: 10px 20px;">Cancel</button>
        </form>
    `);
};

window.deleteSponsor = function() {
    if(confirm("Remove this Sponsor amount? The Total Budget will decrease.")) {
        db.collection("tours").doc(currentTourId).update({ sponsorAmount: 0 });
    }
};

// --- GLOBAL HELPER FUNCTIONS ---
window.triggerEditMember = function(id, name, advance) {
    $('#editMemberId').val(id); $('#memberName').val(name); $('#memberAdvance').val(advance);
    $('#saveMemberBtn').text('Update'); $('#cancelMemberEdit').show();
};
window.triggerEditExpense = function(id, category, desc, date, amount) {
    $('#editExpenseId').val(id); $('#expCategory').val(category).trigger('change'); 
    $('#expDesc').val(desc !== '-' ? desc : ''); $('#expDate').val(date); $('#expAmount').val(amount);
    $('#saveExpenseBtn').text('Update'); $('#cancelExpenseEdit').show();
};
window.deleteRecord = function(collectionName, docId) {
    if(confirm("Delete this record?")) db.collection(`tours/${currentTourId}/${collectionName}`).doc(docId).delete();
};
function resetMemberForm() { $('#addMemberForm')[0].reset(); $('#editMemberId').val(''); $('#saveMemberBtn').text('Save'); $('#cancelMemberEdit').hide(); }
function resetExpenseForm() { $('#addExpenseForm')[0].reset(); $('#editExpenseId').val(''); $('#expDesc').prop('required', false).attr('placeholder', 'Comments (Optional)'); $('#saveExpenseBtn').text('Save'); $('#cancelExpenseEdit').hide(); }
$('#cancelMemberEdit').click(resetMemberForm);
$('#cancelExpenseEdit').click(resetExpenseForm);
