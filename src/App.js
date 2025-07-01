import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, setDoc } from 'firebase/firestore';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

// Define Firebase config (values are loaded from environment variables)
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID
};

// Initialize Firebase outside the component to prevent re-initialization
const app = initializeApp(firebaseConfig);
const dbInstance = getFirestore(app); // Renamed to avoid conflict with state variable
const authInstance = getAuth(app); // Renamed to avoid conflict with state variable

const appId = firebaseConfig.projectId;

// Helper function to format a number with commas
const formatNumberWithCommas = (num) => {
    if (num === '' || num === null || isNaN(num)) {
        return '';
    }
    // Ensure it's a number before formatting
    const number = parseFloat(num);
    if (isNaN(number)) {
        return '';
    }
    // Format to Thai locale with 0-2 decimal places
    return number.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

// Helper function to parse a formatted string back to a number
const parseFormattedNumber = (str) => {
    if (typeof str !== 'string' || str.trim() === '') {
        return 0; // Return 0 for empty or non-string input
    }
    // Remove all non-digit characters except for the decimal point
    const cleanedString = str.replace(/[^0-9.]/g, '');
    const parsed = parseFloat(cleanedString);
    return isNaN(parsed) ? 0 : parsed; // Return 0 if parsing results in NaN
};

// Helper function to format yyyy-MM string to Thai month and year for display
const formatMonthYearForDisplay = (yyyyMm) => { // FIXED: Changed McNamaraMm to yyyyMm
    if (!yyyyMm) return '';
    const [year, month] = yyyyMm.split('-'); // FIXED: Changed McNamaraMm to yyyyMm
    const date = new Date(year, month - 1); // Month is 0-indexed in Date constructor
    return date.toLocaleString('th-TH', { month: 'long', year: 'numeric' });
};

// Modal Components (Moved outside App component)
const Modal = ({ show, onClose, title, children }) => {
    if (!show) return null;
    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg transform transition-all duration-300 scale-100 opacity-100">
                <div className="flex justify-between items-center border-b pb-3 mb-4">
                    <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-3xl font-light">&times;</button>
                </div>
                {children}
            </div>
        </div>
    );
};

const ConfirmModal = ({ show, message, onConfirm, onCancel }) => {
    if (!show) return null;
    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-sm transform transition-all duration-300 scale-100 opacity-100 text-center">
                <h2 className="text-xl font-semibold text-gray-800 mb-4">ยืนยันการดำเนินการ</h2>
                <p className="text-gray-600 mb-6">{message}</p>
                <div className="flex justify-around">
                    <button
                        onClick={onCancel}
                        className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-6 rounded-lg transition duration-200"
                    >
                        ยกเลิก
                    </button>
                    <button
                        onClick={() => { onConfirm(); onCancel(); }}
                        className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-6 rounded-lg transition duration-200"
                    >
                        ยืนยัน
                    </button>
                </div>
            </div>
        </div>
    );
};


function App() {
    // Use the globally initialized instances directly, no need for useState for them
    const db = dbInstance;
    const auth = authInstance;

    const [userId, setUserId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard', 'income-expense', 'assets-liabilities', 'goals'
    const [monthOffset, setMonthOffset] = useState(0); // 0 for current 6 months, 1 for previous 6 months

    // Authentication states
    const [username, setUsername] = useState('');
    const [pin, setPin] = useState('');
    const [isLoginMode, setIsLoginMode] = useState(true); // true for login, false for register
    const [authError, setAuthError] = useState('');
    const [loggedInUsername, setLoggedInUsername] = useState(''); // State to store logged-in username

    // Data states
    const [incomeExpenses, setIncomeExpenses] = useState([]);
    const [assets, setAssets] = useState([]);
    const [liabilities, setLiabilities] = useState([]);
    const [goals, setGoals] = useState([]);

    // Form states
    const [newTransaction, setNewTransaction] = useState({ type: 'expense', amount: '', category: '', description: '', date: new Date().toISOString().split('T')[0] });
    const [newAsset, setNewAsset] = useState({ name: '', value: '', category: '', date: new Date().toISOString().split('T')[0] });
    const [newLiability, setNewLiability] = useState({ name: '', amount: '', category: '', date: new Date().toISOString().split('T')[0], dueDate: '' });
    const [newGoal, setNewGoal] = useState({ name: '', targetAmount: '', currentAmount: '0', dueDate: '', type: 'saving' });

    // Modals
    const [showTransactionModal, setShowTransactionModal] = useState(false);
    const [showAssetModal, setShowAssetModal] = useState(false);
    const [showLiabilityModal, setShowLiabilityModal] = useState(false);
    const [showGoalModal, setShowGoalModal] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null);
    const [confirmMessage, setConfirmMessage] = useState(''); // Corrected initialization

    const currentEditingItem = useRef(null); // Ref to store the item being edited

    // New state for selected month in Income/Expense tab
    const [selectedMonth, setSelectedMonth] = useState('');

    // Initialize Firebase and set up authentication
    useEffect(() => {
        try {
            const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
                if (user) {
                    setUserId(user.uid);
                    // Extract username from email if it's in the dummy domain format
                    const displayUsername = user.email.endsWith('@financeapp.com')
                        ? user.email.substring(0, user.email.indexOf('@financeapp.com'))
                        : user.email;
                    setLoggedInUsername(displayUsername); // Set the logged-in username
                    setAuthError(''); // Clear auth errors on successful login
                } else {
                    setUserId(null);
                    setLoggedInUsername(''); // Clear username on logout
                }
                setLoading(false);
            });

            return () => unsubscribe();
        } catch (err) {
            console.error("ข้อผิดพลาดในการเริ่มต้น Firebase:", err);
            setError("ไม่สามารถเริ่มต้นแอปพลิเคชันได้ โปรดตรวจสอบการกำหนดค่า Firebase");
            setLoading(false);
        }
    }, []); // Empty dependency array means this runs once on mount

    // Fetch data when userId is available
    useEffect(() => {
        if (!db || !userId) {
            // Clear data if user logs out or not authenticated
            setIncomeExpenses([]);
            setAssets([]);
            setLiabilities([]);
            setGoals([]);
            return;
        }

        const collectionPath = (collectionName) => `artifacts/${appId}/users/${userId}/${collectionName}`;

        const unsubIncomeExpenses = onSnapshot(collection(db, collectionPath('income_expenses')), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Sort by date descending for display, but keep original date format
            setIncomeExpenses(data.sort((a, b) => new Date(b.date) - new Date(a.date)));
        }, (err) => setError(`ข้อผิดพลาดในการโหลดรายรับ-รายจ่าย: ${err.message}`));

        const unsubAssets = onSnapshot(collection(db, collectionPath('assets')), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setAssets(data);
        }, (err) => setError(`ข้อผิดพลาดในการโหลดสินทรัพย์: ${err.message}`));

        const unsubLiabilities = onSnapshot(collection(db, collectionPath('liabilities')), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setLiabilities(data);
        }, (err) => setError(`ข้อผิดพลาดในการโหลดหนี้สิน: ${err.message}`));

        const unsubGoals = onSnapshot(collection(db, collectionPath('goals')), (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setGoals(data);
        }, (err) => setError(`ข้อผิดพลาดในการโหลดเป้าหมาย: ${err.message}`));

        return () => {
            unsubIncomeExpenses();
            unsubAssets();
            unsubLiabilities();
            unsubGoals();
        };
    }, [db, userId, appId]); // appId is a constant, can be excluded from dependencies for useEffect

    // Set initial selectedMonth when incomeExpenses data is loaded
    useEffect(() => {
        if (incomeExpenses.length > 0 && !selectedMonth) {
            // Get the latest month from the sorted list
            const latestMonth = sortedMonths[0];
            if (latestMonth) {
                setSelectedMonth(latestMonth);
            }
        }
    }, [incomeExpenses, selectedMonth, sortedMonths]);


    // --- Authentication Handlers ---
    const handleAuthSubmit = async (e) => {
        e.preventDefault();
        setAuthError('');
        setLoading(true);

        // Firebase treats username as email for authentication
        const email = username.includes('@') ? username : `${username}@financeapp.com`; // Append a dummy domain if not an email
        const password = pin; // PIN is treated as password

        try {
            // Use authInstance directly here to avoid potential race conditions with the 'auth' state
            if (isLoginMode) {
                await signInWithEmailAndPassword(authInstance, email, password);
            } else {
                await createUserWithEmailAndPassword(authInstance, email, password);
            }
            setUsername('');
            setPin('');
        } catch (err) {
            console.error("ข้อผิดพลาดในการยืนยันตัวตน:", err.code, err.message);
            if (err.code === 'auth/email-already-in-use') {
                setAuthError("ชื่อผู้ใช้นี้ถูกใช้งานแล้ว โปรดลองใช้ชื่ออื่นหรือเข้าสู่ระบบ");
            } else if (err.code === 'auth/invalid-email' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                setAuthError("ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง");
            } else if (err.code === 'auth/weak-password') {
                setAuthError("PIN ต้องมีความยาวอย่างน้อย 6 ตัวอักษร");
            } else {
                setAuthError(`เกิดข้อผิดพลาด: ${err.message}`);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = async () => {
        if (authInstance) { // Use authInstance directly for logout as well
            try {
                await signOut(authInstance);
                setUserId(null); // Clear user ID on logout
                setLoggedInUsername(''); // Clear logged-in username on logout
                setActiveTab('dashboard'); // Go back to dashboard on logout
            } catch (err) {
                console.error("ข้อผิดพลาดในการออกจากระบบ:", err);
                setError("ไม่สามารถออกจากระบบได้");
            }
        }
    };

    // --- Data Management Functions ---

    const addOrUpdateDoc = async (collectionName, data, id = null) => {
        if (!db || !userId) {
            setError("ผู้ใช้ไม่ได้เข้าสู่ระบบหรือฐานข้อมูลไม่พร้อมใช้งาน");
            return;
        }
        setLoading(true);
        try {
            const colRef = collection(db, `artifacts/${appId}/users/${userId}/${collectionName}`);
            if (id) {
                await updateDoc(doc(colRef, id), data);
                console.log(`เอกสารอัปเดตสำเร็จใน ${collectionName} ด้วย ID: ${id}`);
            } else {
                await addDoc(colRef, data);
                console.log(`เอกสารเพิ่มสำเร็จใน ${collectionName}`);
            }
        } catch (e) {
            console.error(`ข้อผิดพลาดในการเพิ่ม/อัปเดตเอกสารใน ${collectionName}:`, e);
            setError(`ไม่สามารถบันทึกข้อมูลได้: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    const deleteDocById = async (collectionName, id) => {
        if (!db || !userId) {
            setError("ผู้ใช้ไม่ได้เข้าสู่ระบบหรือฐานข้อมูลไม่พร้อมใช้งาน");
            return;
        }
        setLoading(true);
        try {
            await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/${collectionName}`, id));
            console.log(`เอกสารลบสำเร็จจาก ${collectionName} ด้วย ID: ${id}`);
        } catch (e) {
            console.error(`ข้อผิดพลาดในการลบเอกสารจาก ${collectionName}:`, e);
            setError(`ไม่สามารถลบข้อมูลได้: ${e.message}`);
        } finally {
            setLoading(false);
            setShowConfirmModal(false);
        }
    };

    // --- Handlers for Forms ---

    const handleTransactionChange = (e) => {
        const { name, value } = e.target;
        if (name === 'amount') {
            setNewTransaction(prev => ({ ...prev, [name]: parseFormattedNumber(value) }));
        } else {
            setNewTransaction(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleAddOrUpdateTransaction = async (e) => {
        e.preventDefault();
        const data = {
            type: newTransaction.type,
            amount: parseFloat(newTransaction.amount),
            category: newTransaction.category,
            description: newTransaction.description,
            date: newTransaction.date,
            timestamp: new Date(), // For sorting
        };
        if (currentEditingItem.current) {
            await addOrUpdateDoc('income_expenses', data, currentEditingItem.current.id);
        } else {
            await addOrUpdateDoc('income_expenses', data);
        }
        resetTransactionForm();
        setShowTransactionModal(false);
    };

    const handleAssetChange = (e) => {
        const { name, value } = e.target;
        if (name === 'value') {
            setNewAsset(prev => ({ ...prev, [name]: parseFormattedNumber(value) }));
        } else {
            setNewAsset(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleAddOrUpdateAsset = async (e) => {
        e.preventDefault();
        const data = {
            name: newAsset.name,
            value: parseFloat(newAsset.value),
            category: newAsset.category,
            dateAdded: newAsset.date,
            lastUpdated: new Date(),
        };
        if (currentEditingItem.current) {
            await addOrUpdateDoc('assets', data, currentEditingItem.current.id);
        } else {
            await addOrUpdateDoc('assets', data);
        }
        resetAssetForm();
        setShowAssetModal(false);
    };

    const handleLiabilityChange = (e) => {
        const { name, value } = e.target;
        if (name === 'amount') {
            setNewLiability(prev => ({ ...prev, [name]: parseFormattedNumber(value) }));
        } else {
            setNewLiability(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleAddOrUpdateLiability = async (e) => {
        e.preventDefault();
        const data = {
            name: newLiability.name,
            amount: parseFloat(newLiability.amount),
            category: newLiability.category,
            dateAdded: newLiability.date,
            lastUpdated: new Date(),
            dueDate: newLiability.dueDate,
        };
        if (currentEditingItem.current) {
            await addOrUpdateDoc('liabilities', data, currentEditingItem.current.id);
        } else {
            await addOrUpdateDoc('liabilities', data);
        }
        resetLiabilityForm();
        setShowLiabilityModal(false);
    };

    const handleGoalChange = (e) => {
        const { name, value } = e.target;
        if (name === 'targetAmount' || name === 'currentAmount') {
            setNewGoal(prev => ({ ...prev, [name]: parseFormattedNumber(value) }));
        } else {
            setNewGoal(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleAddOrUpdateGoal = async (e) => {
        e.preventDefault();
        const data = {
            name: newGoal.name,
            targetAmount: parseFloat(newGoal.targetAmount),
            currentAmount: parseFloat(newGoal.currentAmount),
            dueDate: newGoal.dueDate,
            type: newGoal.type,
            lastUpdated: new Date(),
        };
        if (currentEditingItem.current) {
            await addOrUpdateDoc('goals', data, currentEditingItem.current.id);
        } else {
            await addOrUpdateDoc('goals', data);
        }
        resetGoalForm();
        setShowGoalModal(false);
    };

    // --- Reset Forms ---
    const resetTransactionForm = () => {
        setNewTransaction({ type: 'expense', amount: '', category: '', description: '', date: new Date().toISOString().split('T')[0] });
        currentEditingItem.current = null;
    };

    const resetAssetForm = () => {
        setNewAsset({ name: '', value: '', category: '', date: new Date().toISOString().split('T')[0] });
        currentEditingItem.current = null;
    };

    const resetLiabilityForm = () => {
        setNewLiability({ name: '', amount: '', category: '', date: new Date().toISOString().split('T')[0], dueDate: '' });
        currentEditingItem.current = null;
    };

    const resetGoalForm = () => {
        setNewGoal({ name: '', targetAmount: '', currentAmount: '0', dueDate: '', type: 'saving' });
        currentEditingItem.current = null;
    };

    // --- Edit Functions ---
    const editTransaction = (item) => {
        currentEditingItem.current = item;
        setNewTransaction({
            type: item.type,
            amount: item.amount,
            category: item.category,
            description: item.description,
            date: item.date,
        });
        setShowTransactionModal(true);
    };

    const editAsset = (item) => {
        currentEditingItem.current = item;
        setNewAsset({
            name: item.name,
            value: item.value,
            category: item.category,
            date: item.dateAdded,
        });
        setShowAssetModal(true);
    };

    const editLiability = (item) => {
        currentEditingItem.current = item;
        setNewLiability({
            name: item.name,
            amount: item.amount,
            category: item.category,
            date: item.dateAdded,
            dueDate: item.dueDate,
        });
        setShowLiabilityModal(true);
    };

    const editGoal = (item) => {
        currentEditingItem.current = item;
        setNewGoal({
            name: item.name,
            targetAmount: item.targetAmount,
            currentAmount: item.currentAmount,
            dueDate: item.dueDate,
            type: item.type,
        });
        setShowGoalModal(true);
    };

    // --- Delete Confirmation ---
    const confirmDelete = (collection, id, message) => {
        setConfirmMessage(message);
        setConfirmAction(() => () => deleteDocById(collection, id));
        setShowConfirmModal(true);
    };

    // --- Calculations for Dashboard ---
    const totalAssets = assets.reduce((sum, asset) => sum + (parseFloat(asset.value) || 0), 0);
    const totalLiabilities = liabilities.reduce((sum, liability) => sum + (parseFloat(liability.amount) || 0), 0);
    const netWorth = totalAssets - totalLiabilities;

    // Data for charts (These are still needed for Assets/Liabilities tab)
    const assetCategories = assets.reduce((acc, asset) => {
        acc[asset.category] = (acc[asset.category] || 0) + (parseFloat(asset.value) || 0);
        return acc;
    }, {});
    const assetPieChartData = Object.keys(assetCategories).map(category => ({
        name: category,
        value: assetCategories[category]
    }));

    const liabilityCategories = liabilities.reduce((acc, liability) => {
        acc[liability.category] = (acc[liability.category] || 0) + (parseFloat(liability.amount) || 0);
        return acc;
    }, {});
    const liabilityPieChartData = Object.keys(liabilityCategories).map(category => ({
        name: category,
        value: liabilityCategories[category]
    }));

    // Color Palettes
    const WARM_COLORS = ['#FF6347', '#FFD700', '#FFA07A', '#FF4500', '#FF8C00', '#FF7F50']; // Tomato, Gold, LightSalmon, OrangeRed, DarkOrange, Coral
    const COOL_COLORS = ['#4682B4', '#6A5ACD', '#87CEEB', '#5F9EA0', '#1E90FF', '#00CED1']; // SteelBlue, SlateBlue, SkyBlue, CadetBlue, DodgerBlue, DarkTurquoise


    // Group income/expenses by month for trend analysis
    const allMonthlyIncomeExpenseData = {};

    incomeExpenses.forEach(item => {
        // Use yyyy-MM for consistent sorting
        const monthKey = item.date.substring(0, 7);
        if (!allMonthlyIncomeExpenseData[monthKey]) {
            allMonthlyIncomeExpenseData[monthKey] = { income: 0, expense: 0, net: 0 };
        }
        if (item.type === 'income') {
            allMonthlyIncomeExpenseData[monthKey].income += parseFloat(item.amount);
        } else {
            allMonthlyIncomeExpenseData[monthKey].expense += parseFloat(item.amount);
        }
        allMonthlyIncomeExpenseData[monthKey].net = allMonthlyIncomeExpenseData[monthKey].income - allMonthlyIncomeExpenseData[monthKey].expense;
    });

    // Sort months chronologically for the trend chart
    const sortedAllMonthKeys = Object.keys(allMonthlyIncomeExpenseData).sort((a, b) => a.localeCompare(b));

    const startIndex = monthOffset * 6;
    const endIndex = startIndex + 6;
    const visibleMonthKeys = sortedAllMonthKeys.slice(startIndex, endIndex);

    const incomeExpenseTrendData = visibleMonthKeys.map(monthKey => ({
        month: monthKey, // Keep yyyy-MM for sorting
        รายรับ: allMonthlyIncomeExpenseData[monthKey].income || 0,
        รายจ่าย: allMonthlyIncomeExpenseData[monthKey].expense || 0,
        สุทธิ: allMonthlyIncomeExpenseData[monthKey].net || 0,
    }));

    // Data for income/expense category distribution (filtered by selectedMonth)
    const filteredIncomeExpensesByMonth = incomeExpenses.filter(item =>
        selectedMonth ? item.date.startsWith(selectedMonth) : true // Filter by selectedMonth if available
    );

    const incomeCategoryDataMonthly = filteredIncomeExpensesByMonth
        .filter(item => item.type === 'income')
        .reduce((acc, item) => {
            acc[item.category] = (acc[item.category] || 0) + parseFloat(item.amount);
            return acc;
        }, {});

    const expenseCategoryDataMonthly = filteredIncomeExpensesByMonth
        .filter(item => item.type === 'expense')
        .reduce((acc, item) => {
            acc[item.category] = (acc[item.category] || 0) + parseFloat(item.amount);
            return acc;
        }, {});

    const incomePieChartDataMonthly = Object.keys(incomeCategoryDataMonthly).map(category => ({
        name: category,
        value: incomeCategoryDataMonthly[category]
    }));

    const expensePieChartDataMonthly = Object.keys(expenseCategoryDataMonthly).map(category => ({
        name: category,
        value: expenseCategoryDataMonthly[category]
    }));


    // Group income/expenses by month for display in the table
    const groupedIncomeExpenses = incomeExpenses.reduce((acc, item) => {
        // Use yyyy-MM for consistent grouping
        const monthKey = item.date.substring(0, 7);
        if (!acc[monthKey]) {
            acc[monthKey] = [];
        }
        acc[monthKey].push(item);
        return acc;
    }, {});

    // Sort months in descending order (most recent first) based on yyyy-MM keys
    const sortedMonths = Object.keys(groupedIncomeExpenses).sort((a, b) => b.localeCompare(a));


    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100 text-gray-700">
                <div className="text-xl font-semibold">กำลังโหลด...</div>
            </div>
        );
    }

    // If not logged in, show login/signup page
    if (!userId) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4 font-inter">
                <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md text-center">
                    <h2 className="text-3xl font-extrabold text-indigo-700 mb-6">ยินดีต้อนรับสู่ The 1%</h2> {/* Updated app name here */}
                    <form onSubmit={handleAuthSubmit} className="space-y-5">
                        <div>
                            <label htmlFor="username" className="block text-left text-sm font-medium text-gray-700 mb-1">
                                ชื่อผู้ใช้ (เช่น อีเมล)
                            </label>
                            <input
                                type="text"
                                id="username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                placeholder="เช่น user@example.com"
                                required
                            />
                        </div>
                        <div>
                            <label htmlFor="pin" className="block text-left text-sm font-medium text-gray-700 mb-1">
                                PIN (รหัสผ่าน 6 ตัวขึ้นไป)
                            </label>
                            <input
                                type="password"
                                id="pin"
                                value={pin}
                                onChange={(e) => setPin(e.target.value)}
                                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                placeholder="••••••"
                                required
                                minLength="6"
                            />
                        </div>
                        {authError && (
                            <p className="text-red-600 text-sm">{authError}</p>
                        )}
                        <button
                            type="submit"
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg shadow-md transition duration-300 transform hover:scale-105"
                            disabled={loading}
                        >
                            {loading ? 'กำลังดำเนินการ...' : isLoginMode ? 'เข้าสู่ระบบ' : 'ลงทะเบียน'}
                        </button>
                    </form>
                    <div className="mt-6">
                        <button
                            onClick={() => setIsLoginMode(!isLoginMode)}
                            className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                        >
                            {isLoginMode ? 'ยังไม่มีบัญชี? ลงทะเบียนที่นี่' : 'มีบัญชีอยู่แล้ว? เข้าสู่ระบบที่นี่'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-red-100 text-red-700 p-4 rounded-lg">
                <div className="text-xl font-semibold">ข้อผิดพลาด: {error}</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 font-inter text-gray-800 flex flex-col">
            {/* Header */}
            <header className="bg-white shadow-md py-4 px-6 flex justify-between items-center rounded-b-xl sticky top-0 z-10">
                <h1 className="text-3xl font-extrabold text-indigo-700">The 1%</h1> {/* Updated app name here */}
                <nav className="flex space-x-4 items-center">
                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`py-2 px-4 rounded-lg font-medium transition-all duration-200 ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        แดชบอร์ด
                    </button>
                    <button
                        onClick={() => setActiveTab('income-expense')}
                        className={`py-2 px-4 rounded-lg font-medium transition-all duration-200 ${activeTab === 'income-expense' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        รายรับ-รายจ่าย
                    </button>
                    <button
                        onClick={() => setActiveTab('assets-liabilities')}
                        className={`py-2 px-4 rounded-lg font-medium transition-all duration-200 ${activeTab === 'assets-liabilities' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        สินทรัพย์-หนี้สิน
                    </button>
                    <button
                        onClick={() => setActiveTab('goals')}
                        className={`py-2 px-4 rounded-lg font-medium transition-all duration-200 ${activeTab === 'goals' ? 'bg-indigo-600 text-white shadow-lg' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        เป้าหมาย
                    </button>
                    <button
                        onClick={handleLogout}
                        className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-200"
                    >
                        ออกจากระบบ
                    </button>
                </nav>
            </header>

            {/* Main Content */}
            <main className="flex-1 p-6 md:p-8 lg:p-10">
                {loggedInUsername && ( // Display loggedInUsername instead of userId
                    <div className="text-right text-sm text-gray-500 mb-4">
                        ชื่อผู้ใช้: <span className="font-mono text-gray-700">{loggedInUsername}</span>
                    </div>
                )}

                {/* Dashboard Tab */}
                {activeTab === 'dashboard' && (
                    <section className="space-y-8">
                        <h2 className="text-4xl font-extrabold text-indigo-800 mb-6 text-center">ภาพรวมการเงินของคุณ</h2>

                        {/* Net Worth Summary */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                            <div className="bg-white p-6 rounded-xl shadow-lg border border-blue-200 text-center transform hover:scale-105 transition-transform duration-300">
                                <h3 className="text-xl font-semibold text-gray-600 mb-2">สินทรัพย์รวม</h3>
                                <p className="text-4xl font-bold text-green-600">{formatNumberWithCommas(totalAssets)} บาท</p>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-lg border border-red-200 text-center transform hover:scale-105 transition-transform duration-300">
                                <h3 className="text-xl font-semibold text-gray-600 mb-2">หนี้สินรวม</h3>
                                <p className="text-4xl font-bold text-red-600">{formatNumberWithCommas(totalLiabilities)} บาท</p>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-lg border border-purple-200 text-center transform hover:scale-105 transition-transform duration-300">
                                <h3 className="text-xl font-semibold text-gray-600 mb-2">มูลค่าสุทธิ</h3>
                                <p className={`text-4xl font-bold ${netWorth >= 0 ? 'text-green-700' : 'text-red-700'}`}>{formatNumberWithCommas(netWorth)} บาท</p>
                            </div>
                        </div>

                        {/* New Bar Chart for Assets vs Liabilities vs Net Worth */}
                        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 mb-8">
                            <h3 className="text-2xl font-bold text-gray-800 mb-4 text-center">สินทรัพย์ vs หนี้สิน vs มูลค่าสุทธิ</h3>
                            {totalAssets > 0 || totalLiabilities > 0 || netWorth !== 0 ? (
                                <ResponsiveContainer width="100%" height={300}>
                                    <BarChart
                                        data={[{ name: 'สถานะการเงิน', สินทรัพย์: totalAssets, หนี้สิน: totalLiabilities, มูลค่าสุทธิ: netWorth }]}
                                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                                        <XAxis dataKey="name" />
                                        <YAxis tickFormatter={formatNumberWithCommas} />
                                        <Tooltip formatter={(value) => `${formatNumberWithCommas(value)} บาท`} />
                                        <Legend />
                                        <Bar dataKey="สินทรัพย์" fill="#4CAF50" barSize={40} />
                                        <Bar dataKey="หนี้สิน" fill="#F44336" barSize={40} />
                                        <Bar dataKey="มูลค่าสุทธิ" fill="#4a90e2" barSize={40} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <p className="text-center text-gray-500 mt-10">ยังไม่มีข้อมูลสินทรัพย์หรือหนี้สิน</p>
                            )}
                        </div>

                        {/* Income/Expense Trend Bar Chart */}
                        <div className="bg-white p-6 rounded-xl shadow-lg mb-8">
                            <h3 className="text-2xl font-bold text-gray-800 mb-4 text-center">แนวโน้มรายรับ-รายจ่าย 6 เดือนล่าสุด</h3>
                            <div className="flex justify-center mb-4 space-x-4">
                                <button
                                    onClick={() => setMonthOffset(prev => Math.max(0, prev - 1))}
                                    disabled={monthOffset === 0}
                                    className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline-block mr-1" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                                    </svg>
                                    ย้อนหลัง
                                </button>
                                <button
                                    onClick={() => setMonthOffset(prev => prev + 1)}
                                    disabled={visibleMonthKeys.length < 6 || startIndex + 6 >= sortedAllMonthKeys.length}
                                    className="bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    ถัดไป
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline-block ml-1" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </div>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={incomeExpenseTrendData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                                    <XAxis dataKey="month" tickFormatter={formatMonthYearForDisplay} angle={-45} textAnchor="end" height={60} />
                                    <YAxis tickFormatter={formatNumberWithCommas} />
                                    <Tooltip formatter={(value) => `${formatNumberWithCommas(value)} บาท`} labelFormatter={formatMonthYearForDisplay} />
                                    <Legend />
                                    <Bar dataKey="รายรับ" fill="#82ca9d" />
                                    <Bar dataKey="รายจ่าย" fill="#ff7300" />
                                    <Bar dataKey="สุทธิ" fill="#8884d8" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </section>
                )}

                {/* Income/Expense Tab */}
                {activeTab === 'income-expense' && (
                    <section className="space-y-8">
                        <h2 className="text-4xl font-extrabold text-indigo-800 mb-6 text-center">บันทึกรายรับ-รายจ่าย</h2>

                        {/* Add Transaction Button and Month Selector */}
                        <div className="flex flex-col md:flex-row justify-between items-center mb-6 space-y-4 md:space-y-0 md:space-x-4">
                            <button
                                onClick={() => { resetTransactionForm(); setShowTransactionModal(true); }}
                                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 transform hover:scale-105 flex items-center"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                                เพิ่มรายการใหม่
                            </button>
                            <div className="flex items-center space-x-2">
                                <label htmlFor="monthSelector" className="text-lg font-medium text-gray-700">เลือกเดือน:</label>
                                <select
                                    id="monthSelector"
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                >
                                    {sortedMonths.length > 0 ? (
                                        sortedMonths.map(monthKey => (
                                            <option key={monthKey} value={monthKey}>
                                                {formatMonthYearForDisplay(monthKey)}
                                            </option>
                                        ))
                                    ) : (
                                        <option value="">ไม่มีข้อมูลเดือน</option>
                                    )}
                                </select>
                            </div>
                        </div>

                        {/* Monthly Income/Expense Category Distribution Charts */}
                        {selectedMonth && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                                <div className="bg-white p-6 rounded-xl shadow-lg">
                                    <h3 className="text-2xl font-bold text-gray-800 mb-4 text-center">สัดส่วนรายรับตามหมวดหมู่ ({formatMonthYearForDisplay(selectedMonth)})</h3>
                                    {incomePieChartDataMonthly.length > 0 ? (
                                        <ResponsiveContainer width="100%" height={300}>
                                            <PieChart>
                                                <Pie
                                                    data={incomePieChartDataMonthly}
                                                    cx="50%"
                                                    cy="50%"
                                                    outerRadius={100}
                                                    fill="#8884d8"
                                                    dataKey="value"
                                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                                >
                                                    {incomePieChartDataMonthly.map((entry, index) => (
                                                        <Cell key={`cell-income-monthly-${index}`} fill={WARM_COLORS[index % WARM_COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip formatter={(value) => `${formatNumberWithCommas(value)} บาท`} />
                                                <Legend />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <p className="text-center text-gray-500">ไม่มีข้อมูลรายรับสำหรับเดือนนี้</p>
                                    )}
                                </div>
                                <div className="bg-white p-6 rounded-xl shadow-lg">
                                    <h3 className="text-2xl font-bold text-gray-800 mb-4 text-center">สัดส่วนรายจ่ายตามหมวดหมู่ ({formatMonthYearForDisplay(selectedMonth)})</h3>
                                    {expensePieChartDataMonthly.length > 0 ? (
                                        <ResponsiveContainer width="100%" height={300}>
                                            <PieChart>
                                                <Pie
                                                    data={expensePieChartDataMonthly}
                                                    cx="50%"
                                                    cy="50%"
                                                    outerRadius={100}
                                                    fill="#8884d8"
                                                    dataKey="value"
                                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                                >
                                                    {expensePieChartDataMonthly.map((entry, index) => (
                                                        <Cell key={`cell-expense-monthly-${index}`} fill={COOL_COLORS[index % COOL_COLORS.length]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip formatter={(value) => `${formatNumberWithCommas(value)} บาท`} />
                                                <Legend />
                                            </PieChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <p className="text-center text-gray-500">ไม่มีข้อมูลรายจ่ายสำหรับเดือนนี้</p>
                                    )}
                                </div>
                            </div>
                        )}


                        {/* Income/Expense List for Selected Month */}
                        {selectedMonth && groupedIncomeExpenses[selectedMonth] && groupedIncomeExpenses[selectedMonth].length > 0 ? (
                            <div className="bg-white p-6 rounded-xl shadow-lg mb-6">
                                <h3 className="text-2xl font-bold text-gray-800 mb-4 border-b pb-2">{formatMonthYearForDisplay(selectedMonth)}</h3>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full bg-white rounded-lg overflow-hidden">
                                        <thead className="bg-gray-100 border-b border-gray-200">
                                            <tr>
                                                <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">วันที่</th>
                                                <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">ประเภท</th>
                                                <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">หมวดหมู่</th>
                                                <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">รายละเอียด</th>
                                                <th className="py-3 px-4 text-right text-sm font-semibold text-gray-600">จำนวนเงิน (บาท)</th>
                                                <th className="py-3 px-4 text-center text-sm font-semibold text-gray-600">การดำเนินการ</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {groupedIncomeExpenses[selectedMonth]
                                                .sort((a, b) => new Date(b.date) - new Date(a.date)) // Sort individual transactions by date
                                                .map(item => (
                                                    <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                                                        <td className="py-3 px-4 text-sm text-gray-700">{item.date}</td>
                                                        <td className={`py-3 px-4 text-sm font-semibold ${item.type === 'income' ? 'text-green-600' : 'text-red-600'}`}>
                                                            {item.type === 'income' ? 'รายรับ' : 'รายจ่าย'}
                                                        </td>
                                                        <td className="py-3 px-4 text-sm text-gray-700">{item.category}</td>
                                                        <td className="py-3 px-4 text-sm text-gray-700">{item.description}</td>
                                                        <td className="py-3 px-4 text-right text-sm font-semibold">
                                                            {formatNumberWithCommas(item.amount)}
                                                        </td>
                                                        <td className="py-3 px-4 text-center text-sm">
                                                            <button
                                                                onClick={() => editTransaction(item)}
                                                                className="text-blue-600 hover:text-blue-800 mr-3"
                                                                title="แก้ไข"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline-block" viewBox="0 0 20 20" fill="currentColor">
                                                                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zm-3.106 5.106L9.293 12.5l1.414 1.414 1.414-1.414 1.414-1.414-2.828-2.828z" />
                                                                    <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                onClick={() => confirmDelete('income_expenses', item.id, `คุณแน่ใจหรือไม่ที่จะลบรายการรายรับ-รายจ่าย "${item.description}"?`)}
                                                                className="text-red-600 hover:text-red-800"
                                                                title="ลบ"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline-block" viewBox="0 0 20 20" fill="currentColor">
                                                                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm2 3a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1zm0 3a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1z" clipRule="evenodd" />
                                                                </svg>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="bg-white p-6 rounded-xl shadow-lg text-center text-gray-500">
                                <p>ไม่มีข้อมูลรายรับ-รายจ่ายสำหรับเดือนที่เลือก</p>
                                <p>กด "เพิ่มรายการใหม่" เพื่อเริ่มต้น หรือเลือกเดือนอื่น</p>
                            </div>
                        )}
                    </section>
                )}

                {/* Assets & Liabilities Tab */}
                {activeTab === 'assets-liabilities' && (
                    <section className="space-y-8">
                        <h2 className="text-4xl font-extrabold text-indigo-800 mb-6 text-center">สินทรัพย์และหนี้สิน</h2>

                        {/* Asset Summary */}
                        <div className="bg-white p-6 rounded-xl shadow-lg mb-6">
                            <div className="flex justify-between items-center border-b pb-3 mb-4">
                                <h3 className="text-2xl font-bold text-gray-800">สินทรัพย์ ({formatNumberWithCommas(totalAssets)} บาท)</h3>
                                <button
                                    onClick={() => { resetAssetForm(); setShowAssetModal(true); }}
                                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 transform hover:scale-105 flex items-center"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                    </svg>
                                    เพิ่มสินทรัพย์
                                </button>
                            </div>
                            {assetPieChartData.length > 0 && (
                                <div className="mb-4">
                                    <ResponsiveContainer width="100%" height={200}>
                                        <PieChart>
                                            <Pie
                                                data={assetPieChartData}
                                                cx="50%"
                                                cy="50%"
                                                outerRadius={80}
                                                fill="#8884d8"
                                                dataKey="value"
                                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                            >
                                                {assetPieChartData.map((entry, index) => (
                                                    <Cell key={`cell-asset-${index}`} fill={WARM_COLORS[index % WARM_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value) => `${formatNumberWithCommas(value)} บาท`} />
                                            <Legend />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                            <div className="overflow-x-auto">
                                <table className="min-w-full bg-white rounded-lg overflow-hidden">
                                    <thead className="bg-gray-100 border-b border-gray-200">
                                        <tr>
                                            <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">ชื่อสินทรัพย์</th>
                                            <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">หมวดหมู่</th>
                                            <th className="py-3 px-4 text-right text-sm font-semibold text-gray-600">มูลค่า (บาท)</th>
                                            <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">วันที่เพิ่ม</th>
                                            <th className="py-3 px-4 text-center text-sm font-semibold text-gray-600">การดำเนินการ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {assets.length > 0 ? (
                                            assets.map(asset => (
                                                <tr key={asset.id} className="border-b border-gray-100 hover:bg-gray-50">
                                                    <td className="py-3 px-4 text-sm text-gray-700">{asset.name}</td>
                                                    <td className="py-3 px-4 text-sm text-gray-700">{asset.category}</td>
                                                    <td className="py-3 px-4 text-right text-sm font-semibold">{formatNumberWithCommas(asset.value)}</td>
                                                    <td className="py-3 px-4 text-sm text-gray-700">{asset.dateAdded}</td>
                                                    <td className="py-3 px-4 text-center text-sm">
                                                        <button
                                                            onClick={() => editAsset(asset)}
                                                            className="text-blue-600 hover:text-blue-800 mr-3"
                                                            title="แก้ไข"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline-block" viewBox="0 0 20 20" fill="currentColor">
                                                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zm-3.106 5.106L9.293 12.5l1.414 1.414 1.414-1.414 1.414-1.414-2.828-2.828z" />
                                                                <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            onClick={() => confirmDelete('assets', asset.id, `คุณแน่ใจหรือไม่ที่จะลบสินทรัพย์ "${asset.name}"?`)}
                                                            className="text-red-600 hover:text-red-800"
                                                            title="ลบ"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline-block" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm2 3a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1zm0 3a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1z" clipRule="evenodd" />
                                                            </svg>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="5" className="py-3 px-4 text-center text-gray-500">ไม่มีข้อมูลสินทรัพย์</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Liabilities Summary */}
                        <div className="bg-white p-6 rounded-xl shadow-lg">
                            <div className="flex justify-between items-center border-b pb-3 mb-4">
                                <h3 className="text-2xl font-bold text-gray-800">หนี้สิน ({formatNumberWithCommas(totalLiabilities)} บาท)</h3>
                                <button
                                    onClick={() => { resetLiabilityForm(); setShowLiabilityModal(true); }}
                                    className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 transform hover:scale-105 flex items-center"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                    </svg>
                                    เพิ่มหนี้สิน
                                </button>
                            </div>
                            {liabilityPieChartData.length > 0 && (
                                <div className="mb-4">
                                    <ResponsiveContainer width="100%" height={200}>
                                        <PieChart>
                                            <Pie
                                                data={liabilityPieChartData}
                                                cx="50%"
                                                cy="50%"
                                                outerRadius={80}
                                                fill="#8884d8"
                                                dataKey="value"
                                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                            >
                                                {liabilityPieChartData.map((entry, index) => (
                                                    <Cell key={`cell-liability-${index}`} fill={COOL_COLORS[index % COOL_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value) => `${formatNumberWithCommas(value)} บาท`} />
                                            <Legend />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                            <div className="overflow-x-auto">
                                <table className="min-w-full bg-white rounded-lg overflow-hidden">
                                    <thead className="bg-gray-100 border-b border-gray-200">
                                        <tr>
                                            <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">ชื่อหนี้สิน</th>
                                            <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">หมวดหมู่</th>
                                            <th className="py-3 px-4 text-right text-sm font-semibold text-gray-600">จำนวนเงิน (บาท)</th>
                                            <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">วันที่เพิ่ม</th>
                                            <th className="py-3 px-4 text-left text-sm font-semibold text-gray-600">ครบกำหนด</th>
                                            <th className="py-3 px-4 text-center text-sm font-semibold text-gray-600">การดำเนินการ</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {liabilities.length > 0 ? (
                                            liabilities.map(liability => (
                                                <tr key={liability.id} className="border-b border-gray-100 hover:bg-gray-50">
                                                    <td className="py-3 px-4 text-sm text-gray-700">{liability.name}</td>
                                                    <td className="py-3 px-4 text-sm text-gray-700">{liability.category}</td>
                                                    <td className="py-3 px-4 text-right text-sm font-semibold">{formatNumberWithCommas(liability.amount)}</td>
                                                    <td className="py-3 px-4 text-sm text-gray-700">{liability.dueDate}</td>
                                                    <td className="py-3 px-4 text-sm text-gray-700">{liability.dateAdded}</td>
                                                    <td className="py-3 px-4 text-center text-sm">
                                                        <button
                                                            onClick={() => editLiability(liability)}
                                                            className="text-blue-600 hover:text-blue-800 mr-3"
                                                            title="แก้ไข"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline-block" viewBox="0 0 20 20" fill="currentColor">
                                                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zm-3.106 5.106L9.293 12.5l1.414 1.414 1.414-1.414 1.414-1.414-2.828-2.828z" />
                                                                <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            onClick={() => confirmDelete('liabilities', liability.id, `คุณแน่ใจหรือไม่ที่จะลบหนี้สิน "${liability.name}"?`)}
                                                            className="text-red-600 hover:text-red-800"
                                                            title="ลบ"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline-block" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm2 3a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1zm0 3a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1z" clipRule="evenodd" />
                                                            </svg>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="6" className="py-3 px-4 text-center text-gray-500">ไม่มีข้อมูลหนี้สิน</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </section>
                )}

                {/* Goals Tab */}
                {activeTab === 'goals' && (
                    <section className="space-y-8">
                        <h2 className="text-4xl font-extrabold text-indigo-800 mb-6 text-center">เป้าหมายทางการเงิน</h2>

                        {/* Add Goal Button */}
                        <div className="flex justify-end mb-6">
                            <button
                                onClick={() => { resetGoalForm(); setShowGoalModal(true); }}
                                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 transform hover:scale-105 flex items-center"
                                >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                                เพิ่มเป้าหมาย
                            </button>
                        </div>

                        {/* Goals List */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {goals.length > 0 ? (
                                goals.map(goal => (
                                    <div key={goal.id} className="bg-white p-6 rounded-xl shadow-lg border border-purple-200 flex flex-col justify-between transform hover:scale-105 transition-transform duration-300">
                                        <div>
                                            <h3 className="text-xl font-bold text-gray-800 mb-2">{goal.name}</h3>
                                            <p className="text-gray-600 mb-1">ประเภท: <span className="font-semibold">{goal.type === 'saving' ? 'ออมเงิน' : 'ลงทุน'}</span></p>
                                            <p className="text-gray-600 mb-1">เป้าหมาย: <span className="font-semibold text-indigo-600">{formatNumberWithCommas(goal.targetAmount)} บาท</span></p>
                                            <p className="text-gray-600 mb-1">ปัจจุบัน: <span className="font-semibold text-green-600">{formatNumberWithCommas(goal.currentAmount)} บาท</span></p>
                                            <p className="text-gray-600 mb-3">ครบกำหนด: <span className="font-semibold">{goal.dueDate}</span></p>
                                            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
                                                <div
                                                    className="bg-purple-600 h-2.5 rounded-full"
                                                    style={{ width: `${Math.min(100, (goal.currentAmount / goal.targetAmount) * 100)}%` }}
                                                ></div>
                                            </div>
                                            <p className="text-sm text-gray-500 text-right">
                                                {((goal.currentAmount / goal.targetAmount) * 100).toFixed(2)}%
                                            </p>
                                        </div>
                                        <div className="flex justify-end mt-4 space-x-2">
                                            <button
                                                onClick={() => editGoal(goal)}
                                                className="text-blue-600 hover:text-blue-800"
                                                title="แก้ไข"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline-block" viewBox="0 0 20 20" fill="currentColor">
                                                    <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zm-3.106 5.106L9.293 12.5l1.414 1.414 1.414-1.414 1.414-1.414-2.828-2.828z" />
                                                    <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => confirmDelete('goals', goal.id, `คุณแน่ใจหรือไม่ที่จะลบเป้าหมาย "${goal.name}"?`)}
                                                className="text-red-600 hover:text-red-800"
                                                title="ลบ"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 inline-block" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 011-1h4a1 1 0 110 2H8a1 1 0 01-1-1zm2 3a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1zm0 3a1 1 0 011-1h2a1 1 0 110 2h-2a1 1 0 01-1-1z" clipRule="evenodd" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="col-span-full bg-white p-6 rounded-xl shadow-lg text-center text-gray-500">
                                    <p>ไม่มีข้อมูลเป้าหมาย</p>
                                    <p>กด "เพิ่มเป้าหมาย" เพื่อเริ่มต้น</p>
                                </div>
                            )}
                        </div>
                    </section>
                )}
            </main>

            {/* Modals */}
            <Modal show={showTransactionModal} onClose={() => { setShowTransactionModal(false); resetTransactionForm(); }} title={currentEditingItem.current ? "แก้ไขรายการ" : "เพิ่มรายการใหม่"}>
                <form onSubmit={handleAddOrUpdateTransaction} className="space-y-4">
                    <div>
                        <label htmlFor="transactionType" className="block text-sm font-medium text-gray-700">ประเภท</label>
                        <select
                            id="transactionType"
                            name="type"
                            value={newTransaction.type}
                            onChange={handleTransactionChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            required
                        >
                            <option value="expense">รายจ่าย</option>
                            <option value="income">รายรับ</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="transactionAmount" className="block text-sm font-medium text-gray-700">จำนวนเงิน (บาท)</label>
                        <input
                            type="text" // Use text to allow formatted input
                            id="transactionAmount"
                            name="amount"
                            value={formatNumberWithCommas(newTransaction.amount)}
                            onChange={handleTransactionChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="เช่น 1,000.00"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="transactionCategory" className="block text-sm font-medium text-gray-700">หมวดหมู่</label>
                        <input
                            type="text"
                            id="transactionCategory"
                            name="category"
                            value={newTransaction.category}
                            onChange={handleTransactionChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="เช่น อาหาร, เงินเดือน"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="transactionDescription" className="block text-sm font-medium text-gray-700">รายละเอียด (ไม่บังคับ)</label>
                        <input
                            type="text"
                            id="transactionDescription"
                            name="description"
                            value={newTransaction.description}
                            onChange={handleTransactionChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="เช่น ค่ากาแฟ, โบนัส"
                        />
                    </div>
                    <div>
                        <label htmlFor="transactionDate" className="block text-sm font-medium text-gray-700">วันที่</label>
                        <input
                            type="date"
                            id="transactionDate"
                            name="date"
                            value={newTransaction.date}
                            onChange={handleTransactionChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            required
                        />
                    </div>
                    <div className="flex justify-end space-x-3 mt-6">
                        <button
                            type="button"
                            onClick={() => { setShowTransactionModal(false); resetTransactionForm(); }}
                            className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-200"
                        >
                            ยกเลิก
                        </button>
                        <button
                            type="submit"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-200"
                        >
                            {currentEditingItem.current ? "บันทึกการแก้ไข" : "เพิ่มรายการ"}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal show={showAssetModal} onClose={() => { setShowAssetModal(false); resetAssetForm(); }} title={currentEditingItem.current ? "แก้ไขสินทรัพย์" : "เพิ่มสินทรัพย์ใหม่"}>
                <form onSubmit={handleAddOrUpdateAsset} className="space-y-4">
                    <div>
                        <label htmlFor="assetName" className="block text-sm font-medium text-gray-700">ชื่อสินทรัพย์</label>
                        <input
                            type="text"
                            id="assetName"
                            name="name"
                            value={newAsset.name}
                            onChange={handleAssetChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="เช่น บ้าน, รถยนต์"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="assetValue" className="block text-sm font-medium text-gray-700">มูลค่า (บาท)</label>
                        <input
                            type="text" // Use text to allow formatted input
                            id="assetValue"
                            name="value"
                            value={formatNumberWithCommas(newAsset.value)}
                            onChange={handleAssetChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="เช่น 5,000,000"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="assetCategory" className="block text-sm font-medium text-gray-700">หมวดหมู่</label>
                        <input
                            type="text"
                            id="assetCategory"
                            name="category"
                            value={newAsset.category}
                            onChange={handleAssetChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="เช่น อสังหาริมทรัพย์, ยานพาหนะ"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="assetDate" className="block text-sm font-medium text-gray-700">วันที่เพิ่ม</label>
                        <input
                            type="date"
                            id="assetDate"
                            name="date"
                            value={newAsset.date}
                            onChange={handleAssetChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            required
                        />
                    </div>
                    <div className="flex justify-end space-x-3 mt-6">
                        <button
                            type="button"
                            onClick={() => { setShowAssetModal(false); resetAssetForm(); }}
                            className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-200"
                        >
                            ยกเลิก
                        </button>
                        <button
                            type="submit"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-200"
                        >
                            {currentEditingItem.current ? "บันทึกการแก้ไข" : "เพิ่มสินทรัพย์"}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal show={showLiabilityModal} onClose={() => { setShowLiabilityModal(false); resetLiabilityForm(); }} title={currentEditingItem.current ? "แก้ไขหนี้สิน" : "เพิ่มหนี้สินใหม่"}>
                <form onSubmit={handleAddOrUpdateLiability} className="space-y-4">
                    <div>
                        <label htmlFor="liabilityName" className="block text-sm font-medium text-gray-700">ชื่อหนี้สิน</label>
                        <input
                            type="text"
                            id="liabilityName"
                            name="name"
                            value={newLiability.name}
                            onChange={handleLiabilityChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="เช่น หนี้บัตรเครดิต, เงินกู้บ้าน"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="liabilityAmount" className="block text-sm font-medium text-gray-700">จำนวนเงิน (บาท)</label>
                        <input
                            type="text" // Use text to allow formatted input
                            id="liabilityAmount"
                            name="amount"
                            value={formatNumberWithCommas(newLiability.amount)}
                            onChange={handleLiabilityChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="เช่น 100,000"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="liabilityCategory" className="block text-sm font-medium text-gray-700">หมวดหมู่</label>
                        <input
                            type="text"
                            id="liabilityCategory"
                            name="category"
                            value={newLiability.category}
                            onChange={handleLiabilityChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="เช่น หนี้สินระยะยาว, หนี้สินระยะสั้น"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="liabilityDate" className="block text-sm font-medium text-gray-700">วันที่เพิ่ม</label>
                        <input
                            type="date"
                            id="liabilityDate"
                            name="date"
                            value={newLiability.date}
                            onChange={handleLiabilityChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="liabilityDueDate" className="block text-sm font-medium text-gray-700">ครบกำหนด (ไม่บังคับ)</label>
                        <input
                            type="date"
                            id="liabilityDueDate"
                            name="dueDate"
                            value={newLiability.dueDate}
                            onChange={handleLiabilityChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                    </div>
                    <div className="flex justify-end space-x-3 mt-6">
                        <button
                            type="button"
                            onClick={() => { setShowLiabilityModal(false); resetLiabilityForm(); }}
                            className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-200"
                        >
                            ยกเลิก
                        </button>
                        <button
                            type="submit"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-200"
                        >
                            {currentEditingItem.current ? "บันทึกการแก้ไข" : "เพิ่มหนี้สิน"}
                        </button>
                    </div>
                </form>
            </Modal>

            <Modal show={showGoalModal} onClose={() => { setShowGoalModal(false); resetGoalForm(); }} title={currentEditingItem.current ? "แก้ไขเป้าหมาย" : "เพิ่มเป้าหมายใหม่"}>
                <form onSubmit={handleAddOrUpdateGoal} className="space-y-4">
                    <div>
                        <label htmlFor="goalName" className="block text-sm font-medium text-gray-700">ชื่อเป้าหมาย</label>
                        <input
                            type="text"
                            id="goalName"
                            name="name"
                            value={newGoal.name}
                            onChange={handleGoalChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="เช่น เงินดาวน์บ้าน, ทริปเที่ยว"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="goalTargetAmount" className="block text-sm font-medium text-gray-700">จำนวนเงินเป้าหมาย (บาท)</label>
                        <input
                            type="text" // Use text to allow formatted input
                            id="goalTargetAmount"
                            name="targetAmount"
                            value={formatNumberWithCommas(newGoal.targetAmount)}
                            onChange={handleGoalChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="เช่น 100,000"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="goalCurrentAmount" className="block text-sm font-medium text-gray-700">จำนวนเงินปัจจุบัน (บาท)</label>
                        <input
                            type="text" // Use text to allow formatted input
                            id="goalCurrentAmount"
                            name="currentAmount"
                            value={formatNumberWithCommas(newGoal.currentAmount)}
                            onChange={handleGoalChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="เช่น 10,000"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="goalDueDate" className="block text-sm font-medium text-gray-700">ครบกำหนด</label>
                        <input
                            type="date"
                            id="goalDueDate"
                            name="dueDate"
                            value={newGoal.dueDate}
                            onChange={handleGoalChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="goalType" className="block text-sm font-medium text-gray-700">ประเภทเป้าหมาย</label>
                        <select
                            id="goalType"
                            name="type"
                            value={newGoal.type}
                            onChange={handleGoalChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            required
                        >
                            <option value="saving">ออมเงิน</option>
                            <option value="investment">ลงทุน</option>
                        </select>
                    </div>
                    <div className="flex justify-end space-x-3 mt-6">
                        <button
                            type="button"
                            onClick={() => { setShowGoalModal(false); resetGoalForm(); }}
                            className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-200"
                        >
                            ยกเลิก
                        </button>
                        <button
                            type="submit"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-200"
                        >
                            {currentEditingItem.current ? "บันทึกการแก้ไข" : "เพิ่มเป้าหมาย"}
                        </button>
                    </div>
                </form>
            </Modal>

            <ConfirmModal
                show={showConfirmModal}
                message={confirmMessage}
                onConfirm={confirmAction}
                onCancel={() => setShowConfirmModal(false)}
            />
        </div>
    );
}

export default App;
