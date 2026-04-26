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

// Arrays to store data for PDF exports
let membersPdfData = [];
let expensesPdfData = [];

$(document).ready(function() {

    // --- 0. LOAD EXISTING TOURS ON STARTUP ---
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

    // --- 1. CREATE NEW TOUR ---
    $('#createTourForm').submit(function(e) {
        e.preventDefault();
        const tourData = {
            name: $('#tourName').val(),
            membersCount: parseInt($('#tourMembers').val()),
            baseAmount: parseFloat($('#tourAmount').val()),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        db.collection("tours").add(tourData).then((docRef) => {
            loadTourDashboard(docRef.id);
        });
    });

    // --- Helper: Load Tour Data into UI ---
    function loadTourDashboard(tourId) {
        db.collection("tours").doc(tourId).get().then((doc) => {
            let tourData = doc.data();
            currentTourId = tourId;
            perMemberBaseAmount = tourData.baseAmount;
            totalTourBudget = tourData.membersCount * tourData.baseAmount;
            
            $('#displayTourName').text(tourData.name);
            $('#calcTotalBudget').text(`₹${totalTourBudget}`);
            
            $('#setup-screen').removeClass('active');
            $('#dashboard-screen').addClass('active');
            
            listenToMembers();
            listenToExpenses();
        });
    }

    // --- 2. ADD / UPDATE SQUAD MEMBER ---
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

        if (editId) {
            db.collection(`tours/${currentTourId}/members`).doc(editId).update(memberData).then(resetMemberForm);
        } else {
            db.collection(`tours/${currentTourId}/members`).add(memberData).then(resetMemberForm);
        }
    });

    // --- 3. CONDITIONAL REQUIRED FOR "OTHERS" ---
    $('#expCategory').change(function() {
        if ($(this).val() === 'Others') {
            $('#expDesc').prop('required', true).attr('placeholder', 'Comments (Required)*');
        } else {
            $('#expDesc').prop('required', false).attr('placeholder', 'Comments (Optional)');
        }
    });

    // --- 4. ADD / UPDATE EXPENSE ---
    $('#addExpenseForm').submit(function(e) {
        e.preventDefault();
        let editId = $('#editExpenseId').val();
        let expData = {
            category: $('#expCategory').val(),
            desc: $('#expDesc').val() || "-",
            date: $('#expDate').val(),
            amount: parseFloat($('#expAmount').val())
        };

        if(editId) {
            db.collection(`tours/${currentTourId}/expenses`).doc(editId).update(expData).then(resetExpenseForm);
        } else {
            db.collection(`tours/${currentTourId}/expenses`).add(expData).then(resetExpenseForm);
        }
    });

    // --- 5. PDF DOWNLOADS ---
    $('#downloadMembersPdf').click(function() {
        const { jsPDF } = window.jspdf; const doc = new jsPDF();
        doc.text("Squad Contributions & Balances", 14, 15);
        doc.autoTable({ startY: 20, head: [['Squad', 'Amount', 'Advance', 'Balance']], body: membersPdfData, theme: 'grid', headStyles: { fillColor: [30, 90, 50] } });
        doc.save('Squad_Balances.pdf');
    });

    $('#downloadExpensesPdf').click(function() {
        const { jsPDF } = window.jspdf; const doc = new jsPDF();
        doc.text("Tour Expenses Ledger", 14, 15);
        doc.autoTable({ startY: 20, head: [['Category', 'Comments', 'Date', 'Amount']], body: expensesPdfData, theme: 'striped', headStyles: { fillColor: [30, 90, 50] } });
        doc.save('Tour_Expenses.pdf');
    });

}); // End Document Ready

// --- REAL-TIME LISTENERS & RENDERERS ---

function listenToMembers() {
    db.collection(`tours/${currentTourId}/members`).onSnapshot((snapshot) => {
        let tbody = ''; let totBase = 0, totAdv = 0, totBal = 0;
        membersPdfData = []; // Reset array

        snapshot.forEach((doc) => {
            const d = doc.data(); const id = doc.id;
            totBase += d.amount; totAdv += d.advance; totBal += d.balance;
            
            // Push to PDF Array
            membersPdfData.push([d.name, `Rs. ${d.amount}`, `Rs. ${d.advance}`, `Rs. ${d.balance}`]);

            const checkedStatus = d.isPaid ? 'checked disabled' : 'disabled';
            tbody += `
                <tr>
                    <td>${d.name}</td>
                    <td>${d.amount}</td>
                    <td style="text-align:center;"><input type="checkbox" ${checkedStatus}></td>
                    <td>${d.advance}</td>
                    <td>${d.balance}</td>
                    <td>
                        <button class="btn-edit" onclick="triggerEditMember('${id}', '${d.name}', '${d.advance}')">✎</button>
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
        let tbody = ''; let totalExpenses = 0;
        expensesPdfData = []; // Reset Array

        snapshot.forEach((doc) => {
            const d = doc.data(); const id = doc.id;
            totalExpenses += d.amount;
            
            // Push to PDF Array
            expensesPdfData.push([d.category, d.desc, d.date, `Rs. ${d.amount.toFixed(2)}`]);

            tbody += `
                <tr>
                    <td>${d.category}</td>
                    <td>${d.desc}</td>
                    <td>${d.date}</td>
                    <td>₹${d.amount.toFixed(2)}</td>
                    <td>
                        <button class="btn-edit" onclick="triggerEditExpense('${id}', '${d.category}', '${d.desc}', '${d.date}', '${d.amount}')">✎</button>
                        <button class="btn-del" onclick="deleteRecord('expenses', '${id}')">X</button>
                    </td>
                </tr>
            `;
        });
        $('#expensesTable tbody').html(tbody);
        $('#totExp').text(`₹${totalExpenses.toFixed(2)}`);
        $('#calcTotalExpenses').text(`₹${totalExpenses.toFixed(2)}`);
        $('#calcOverallBalance').text(`₹${(totalTourBudget - totalExpenses).toFixed(2)}`);
    });
}

// --- GLOBAL HELPER FUNCTIONS ---

window.triggerEditMember = function(id, name, advance) {
    $('#editMemberId').val(id);
    $('#memberName').val(name);
    $('#memberAdvance').val(advance);
    $('#saveMemberBtn').text('Update');
    $('#cancelMemberEdit').show();
};

window.triggerEditExpense = function(id, category, desc, date, amount) {
    $('#editExpenseId').val(id);
    $('#expCategory').val(category).trigger('change'); // trigger checks 'Others' logic
    $('#expDesc').val(desc !== '-' ? desc : '');
    $('#expDate').val(date);
    $('#expAmount').val(amount);
    $('#saveExpenseBtn').text('Update');
    $('#cancelExpenseEdit').show();
};

window.deleteRecord = function(collectionName, docId) {
    if(confirm("Delete this record?")) db.collection(`tours/${currentTourId}/${collectionName}`).doc(docId).delete();
};

function resetMemberForm() {
    $('#addMemberForm')[0].reset();
    $('#editMemberId').val('');
    $('#saveMemberBtn').text('Save');
    $('#cancelMemberEdit').hide();
}

function resetExpenseForm() {
    $('#addExpenseForm')[0].reset();
    $('#editExpenseId').val('');
    $('#expDesc').prop('required', false).attr('placeholder', 'Comments (Optional)');
    $('#saveExpenseBtn').text('Save');
    $('#cancelExpenseEdit').hide();
}

// Wire up cancel buttons
$('#cancelMemberEdit').click(resetMemberForm);
$('#cancelExpenseEdit').click(resetExpenseForm);
