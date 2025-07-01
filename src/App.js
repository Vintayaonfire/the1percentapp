import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, addDoc, getDocs, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, setDoc } from 'firebase/firestore';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

const firebaseConfig = {
  apiKey: "AIzaSyAMw_yYItNzkk_jR9oRXMcY54bjcrCkjKM",
  authDomain: "the1percentapp-1939f.firebaseapp.com",
  projectId: "the1percentapp-1939f",
  storageBucket: "the1percentapp-1939f.firebasestorage.app",
  messagingSenderId: "423767704252",
  appId: "1:423767704252:web:b52adea1877240759e46b9"
};

// Initialize Firebase
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

// Helper function to format McNamara-MM string to Thai month and year for display
const formatMonthYearForDisplay = (yyyyMm) => {
    if (!yyyyMm) return '';
    const [year, month] = yyyyMm.split('-');
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
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
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
    const [confirmMessage, setConfirmMessage] = useState('');

    const currentEditingItem = useRef(null); // Ref to store the item being edited

    // Initialize Firebase and set up authentication
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const firestoreInstance = getFirestore(app);
            setAuth(authInstance);
            setDb(firestoreInstance);

            const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
                if (user) {
                    setUserId(user.uid);
                    setAuthError(''); // Clear auth errors on successful login
                } else {
                    setUserId(null);
                }
                setLoading(false);
            });

            return () => unsubscribe();
        } catch (err) {
            console.error("ข้อผิดพลาดในการเริ่มต้น Firebase:", err);
            setError("ไม่สามารถเริ่มต้นแอปพลิเคชันได้ โปรดตรวจสอบการกำหนดค่า Firebase");
            setLoading(false);
        }
    }, []);

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
    }, [db, userId, appId]);

    // --- Authentication Handlers ---
    const handleAuthSubmit = async (e) => {
        e.preventDefault();
        setAuthError('');
        setLoading(true);

        // Firebase treats username as email for authentication
        const email = username.includes('@') ? username : `${username}@financeapp.com`; // Append a dummy domain if not an email
        const password = pin; // PIN is treated as password

        try {
            if (isLoginMode) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
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
        if (auth) {
            try {
                await signOut(auth);
                setUserId(null); // Clear user ID on logout
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

    const totalIncome = incomeExpenses.filter(t => t.type === 'income').reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const totalExpenses = incomeExpenses.filter(t => t.type === 'expense').reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
    const netCashFlow = totalIncome - totalExpenses;

    // Data for charts
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

    const sortedAllMonthKeys = Object.keys(allMonthlyIncomeExpenseData).sort((a, b) => b.localeCompare(a)); // Sort descending for latest months

    const startIndex = monthOffset * 6;
    const endIndex = startIndex + 6;
    const visibleMonthKeys = sortedAllMonthKeys.slice(startIndex, endIndex).sort((a, b) => a.localeCompare(b)); // Sort ascending for chart display

    const incomeExpenseTrendData = visibleMonthKeys.map(monthKey => ({
        month: monthKey, // Keep yyyy-MM for sorting
        รายรับ: allMonthlyIncomeExpenseData[monthKey].income,
        รายจ่าย: allMonthlyIncomeExpenseData[monthKey].expense,
        สุทธิ: allMonthlyIncomeExpenseData[monthKey].net,
    }));

    // Data for income/expense category distribution
    const incomeCategoryData = incomeExpenses
        .filter(item => item.type === 'income')
        .reduce((acc, item) => {
            acc[item.category] = (acc[item.category] || 0) + parseFloat(item.amount);
            return acc;
        }, {});

    const expenseCategoryData = incomeExpenses
        .filter(item => item.type === 'expense')
        .reduce((acc, item) => {
            acc[item.category] = (acc[item.category] || 0) + parseFloat(item.amount);
            return acc;
        }, {});

    const incomePieChartData = Object.keys(incomeCategoryData).map(category => ({
        name: category,
        value: incomeCategoryData[category]
    }));

    const expensePieChartData = Object.keys(expenseCategoryData).map(category => ({
        name: category,
        value: expenseCategoryData[category]
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
                {userId && (
                    <div className="text-right text-sm text-gray-500 mb-4">
                        User ID: <span className="font-mono text-gray-700">{userId}</span>
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
                                <p className="text-4xl font-bold text-green-600">{totalAssets.toLocaleString('th-TH')} บาท</p>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-lg border border-red-200 text-center transform hover:scale-105 transition-transform duration-300">
                                <h3 className="text-xl font-semibold text-gray-600 mb-2">หนี้สินรวม</h3>
                                <p className="text-4xl font-bold text-red-600">{totalLiabilities.toLocaleString('th-TH')} บาท</p>
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-lg border border-indigo-200 text-center transform hover:scale-105 transition-transform duration-300">
                                <h3 className="text-xl font-semibold text-gray-600 mb-2">ความมั่งคั่งสุทธิ</h3>
                                <p className={`text-5xl font-extrabold ${netWorth >= 0 ? 'text-indigo-700' : 'text-red-700'}`}>
                                    {netWorth.toLocaleString('th-TH')} บาท
                                </p>
                            </div>
                        </div>

                        {/* Charts Section */}
                        <div className="grid grid-cols-1 gap-8">
                            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                                <h3 className="text-2xl font-semibold text-gray-700 mb-4">สินทรัพย์ vs หนี้สิน</h3>
                                {totalAssets > 0 || totalLiabilities > 0 || netWorth !== 0 ? (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart
                                            data={[{ name: 'สถานะการเงิน', สินทรัพย์: totalAssets, หนี้สิน: totalLiabilities, ความมั่งคั่งสุทธิ: netWorth }]}
                                            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                                            <XAxis dataKey="name" />
                                            <YAxis />
                                            <Tooltip formatter={(value) => `${value.toLocaleString('th-TH')} บาท`} />
                                            <Legend />
                                            {/* Bar Chart for Assets vs Liabilities vs Net Worth */}
                                            <Bar dataKey="สินทรัพย์" fill="#4CAF50" barSize={40} />
                                            <Bar dataKey="หนี้สิน" fill="#F44336" barSize={40} />
                                            <Bar dataKey="ความมั่งคั่งสุทธิ" fill="#4a90e2" barSize={40} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <p className="text-center text-gray-500 mt-10">ยังไม่มีข้อมูลสินทรัพย์หรือหนี้สิน</p>
                                )}
                            </div>
                        </div>

                        {/* Income/Expense Trend */}
                        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 mt-8">
                            <h3 className="text-2xl font-semibold text-gray-700 mb-4">แนวโน้มรายรับ-รายจ่าย (กระแสเงินสด)</h3>
                            <div className="flex justify-center mb-4 space-x-4">
                                <button
                                    onClick={() => setMonthOffset(prev => prev + 1)}
                                    disabled={startIndex + 6 >= sortedAllMonthKeys.length}
                                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    เดือนก่อนหน้า
                                </button>
                                <button
                                    onClick={() => setMonthOffset(prev => Math.max(0, prev - 1))}
                                    disabled={monthOffset === 0}
                                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    เดือนถัดไป
                                </button>
                            </div>
                            {incomeExpenseTrendData.length > 0 ? (
                                <ResponsiveContainer width="100%" height={350}>
                                    <BarChart
                                        data={incomeExpenseTrendData}
                                        margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
                                        <XAxis dataKey="month" tickFormatter={formatMonthYearForDisplay} />
                                        <YAxis />
                                        <Tooltip formatter={(value) => `${value.toLocaleString('th-TH')} บาท`} />
                                        <Legend />
                                        {/* Bar Chart for Income, Expense, and Net Cash Flow */}
                                        <Bar dataKey="รายรับ" fill="#82ca9d" radius={[5, 5, 0, 0]} />
                                        <Bar dataKey="รายจ่าย" fill="#FA8072" radius={[5, 5, 0, 0]} />
                                        <Bar dataKey="สุทธิ" fill="#4a90e2" radius={[5, 5, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <p className="text-center text-gray-500 mt-10">ยังไม่มีข้อมูลรายรับ-รายจ่าย</p>
                            )}
                        </div>

                        {/* Financial Health Analysis (Simplified) */}
                        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 mt-8">
                            <h3 className="text-2xl font-semibold text-gray-700 mb-4">วิเคราะห์สุขภาพการเงิน</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-lg">
                                <p><span className="font-semibold">กระแสเงินสดสุทธิ:</span> <span className={netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}>{netCashFlow.toLocaleString('th-TH')} บาท/เดือน</span></p>
                                <p><span className="font-semibold">อัตราส่วนหนี้สินต่อสินทรัพย์:</span> {totalAssets > 0 ? ((totalLiabilities / totalAssets) * 100).toFixed(2) : 0}%</p>
                                {/* More sophisticated analysis would require more data and historical tracking */}
                            </div>
                        </div>
                    </section>
                )}

                {/* Income/Expense Tab */}
                {activeTab === 'income-expense' && (
                    <section>
                        <h2 className="text-3xl font-extrabold text-indigo-800 mb-6 text-center">บันทึกรายรับ-รายจ่าย</h2>
                        <div className="flex justify-center mb-6">
                            <button
                                onClick={() => { setShowTransactionModal(true); resetTransactionForm(); }}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 transform hover:scale-105"
                            >
                                + เพิ่มรายการใหม่
                            </button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                                <h3 className="text-2xl font-semibold text-gray-700 mb-4">สัดส่วนรายรับตามหมวดหมู่</h3>
                                {incomePieChartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <PieChart>
                                            <Pie
                                                data={incomePieChartData}
                                                cx="50%"
                                                cy="50%"
                                                labelLine={false}
                                                outerRadius={100}
                                                fill="#8884d8"
                                                dataKey="value"
                                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                            >
                                                {incomePieChartData.map((entry, index) => (
                                                    <Cell key={`cell-income-${index}`} fill={COOL_COLORS[index % COOL_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value) => `${value.toLocaleString('th-TH')} บาท`} />
                                            <Legend />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <p className="text-center text-gray-500 mt-10">ยังไม่มีข้อมูลรายรับ</p>
                                )}
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                                <h3 className="text-2xl font-semibold text-gray-700 mb-4">สัดส่วนรายจ่ายตามหมวดหมู่</h3>
                                {expensePieChartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <PieChart>
                                            <Pie
                                                data={expensePieChartData}
                                                cx="50%"
                                                cy="50%"
                                                labelLine={false}
                                                outerRadius={100}
                                                fill="#8884d8"
                                                dataKey="value"
                                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                            >
                                                {expensePieChartData.map((entry, index) => (
                                                    <Cell key={`cell-expense-${index}`} fill={WARM_COLORS[index % WARM_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value) => `${value.toLocaleString('th-TH')} บาท`} />
                                            <Legend />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <p className="text-center text-gray-500 mt-10">ยังไม่มีข้อมูลรายจ่าย</p>
                                )}
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                            <h3 className="text-2xl font-semibold text-gray-700 mb-4">รายการทั้งหมด</h3>
                            {incomeExpenses.length === 0 ? (
                                <p className="text-center text-gray-500 py-10">ยังไม่มีรายการรายรับ-รายจ่าย</p>
                            ) : (
                                <div className="space-y-6">
                                    {sortedMonths.map(monthKey => (
                                        <div key={monthKey} className="border border-gray-200 rounded-lg overflow-hidden">
                                            <h4 className="bg-gray-100 text-lg font-semibold text-gray-700 p-4 border-b border-gray-200">
                                                {formatMonthYearForDisplay(monthKey)}
                                            </h4>
                                            <div className="overflow-x-auto">
                                                <table className="min-w-full divide-y divide-gray-200">
                                                    <thead className="bg-gray-50">
                                                        <tr>
                                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                วันที่
                                                            </th>
                                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                ประเภท
                                                            </th>
                                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                หมวดหมู่
                                                            </th>
                                                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                รายละเอียด
                                                            </th>
                                                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                จำนวนเงิน (บาท)
                                                            </th>
                                                            <th scope="col" className="relative px-6 py-3">
                                                                <span className="sr-only">แก้ไข/ลบ</span>
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="bg-white divide-y divide-gray-200">
                                                        {groupedIncomeExpenses[monthKey].map((item) => (
                                                            <tr key={item.id}>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    {item.date}
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${item.type === 'income' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                                        {item.type === 'income' ? 'รายรับ' : 'รายจ่าย'}
                                                                    </span>
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    {item.category}
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    {item.description}
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium">
                                                                    <span className={item.type === 'income' ? 'text-green-600' : 'text-red-600'}>
                                                                        {parseFloat(item.amount).toLocaleString('th-TH')}
                                                                    </span>
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                                    <button
                                                                        onClick={() => editTransaction(item)}
                                                                        className="text-indigo-600 hover:text-indigo-900 mr-3"
                                                                    >
                                                                        แก้ไข
                                                                    </button>
                                                                    <button
                                                                        onClick={() => confirmDelete('income_expenses', item.id, `คุณแน่ใจหรือไม่ที่ต้องการลบรายการ "${item.description}"?`)}
                                                                        className="text-red-600 hover:text-red-900"
                                                                    >
                                                                        ลบ
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </section>
                )}

                {/* Assets/Liabilities Tab */}
                {activeTab === 'assets-liabilities' && (
                    <section>
                        <h2 className="text-3xl font-extrabold text-indigo-800 mb-6 text-center">จัดการสินทรัพย์และหนี้สิน</h2>
                        <div className="flex justify-center space-x-4 mb-6">
                            <button
                                onClick={() => { setShowAssetModal(true); resetAssetForm(); }}
                                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 transform hover:scale-105"
                            >
                                + เพิ่มสินทรัพย์
                            </button>
                            <button
                                onClick={() => { setShowLiabilityModal(true); resetLiabilityForm(); }}
                                className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 transform hover:scale-105"
                            >
                                + เพิ่มหนี้สิน
                            </button>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                                <h3 className="text-2xl font-semibold text-gray-700 mb-4">สัดส่วนสินทรัพย์</h3>
                                {assetPieChartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <PieChart>
                                            <Pie
                                                data={assetPieChartData}
                                                cx="50%"
                                                cy="50%"
                                                labelLine={false}
                                                outerRadius={100}
                                                fill="#8884d8"
                                                dataKey="value"
                                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                            >
                                                {assetPieChartData.map((entry, index) => (
                                                    <Cell key={`cell-asset-${index}`} fill={COOL_COLORS[index % COOL_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value) => `${value.toLocaleString('th-TH')} บาท`} />
                                            <Legend />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <p className="text-center text-gray-500 mt-10">ยังไม่มีข้อมูลสินทรัพย์</p>
                                )}
                            </div>
                            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                                <h3 className="text-2xl font-semibold text-gray-700 mb-4">สัดส่วนหนี้สิน</h3>
                                {liabilityPieChartData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={300}>
                                        <PieChart>
                                            <Pie
                                                data={liabilityPieChartData}
                                                cx="50%"
                                                cy="50%"
                                                labelLine={false}
                                                outerRadius={100}
                                                fill="#8884d8"
                                                dataKey="value"
                                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                            >
                                                {liabilityPieChartData.map((entry, index) => (
                                                    <Cell key={`cell-liability-${index}`} fill={WARM_COLORS[index % WARM_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value) => `${value.toLocaleString('th-TH')} บาท`} />
                                            <Legend />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <p className="text-center text-gray-500 mt-10">ยังไม่มีข้อมูลหนี้สิน</p>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Assets List */}
                            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                                <h3 className="text-2xl font-semibold text-gray-700 mb-4">สินทรัพย์ ({totalAssets.toLocaleString('th-TH')} บาท)</h3>
                                {assets.length === 0 ? (
                                    <p className="text-center text-gray-500 py-10">ยังไม่มีสินทรัพย์</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        ชื่อ
                                                    </th>
                                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        หมวดหมู่
                                                    </th>
                                                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        มูลค่า (บาท)
                                                    </th>
                                                    <th scope="col" className="relative px-6 py-3">
                                                        <span className="sr-only">แก้ไข/ลบ</span>
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {assets.map((item) => (
                                                    <tr key={item.id}>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                            {item.name}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                            {item.category}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                                                            {parseFloat(item.value).toLocaleString('th-TH')}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                            <button
                                                                onClick={() => editAsset(item)}
                                                                className="text-indigo-600 hover:text-indigo-900 mr-3"
                                                            >
                                                                แก้ไข
                                                            </button>
                                                            <button
                                                                onClick={() => confirmDelete('assets', item.id, `คุณแน่ใจหรือไม่ที่ต้องการลบสินทรัพย์ "${item.name}"?`)}
                                                                className="text-red-600 hover:text-red-900"
                                                            >
                                                                ลบ
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>

                            {/* Liabilities List */}
                            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                                <h3 className="text-2xl font-semibold text-gray-700 mb-4">หนี้สิน ({totalLiabilities.toLocaleString('th-TH')} บาท)</h3>
                                {liabilities.length === 0 ? (
                                    <p className="text-center text-gray-500 py-10">ยังไม่มีหนี้สิน</p>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        ชื่อ
                                                    </th>
                                                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        หมวดหมู่
                                                    </th>
                                                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                        จำนวนเงิน (บาท)
                                                    </th>
                                                    <th scope="col" className="relative px-6 py-3">
                                                        <span className="sr-only">แก้ไข/ลบ</span>
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {liabilities.map((item) => (
                                                    <tr key={item.id}>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                            {item.name}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                            {item.category}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                                                            {parseFloat(item.amount).toLocaleString('th-TH')}
                                                        </td>
                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                            <button
                                                                onClick={() => editLiability(item)}
                                                                className="text-indigo-600 hover:text-indigo-900 mr-3"
                                                            >
                                                                แก้ไข
                                                            </button>
                                                            <button
                                                                onClick={() => confirmDelete('liabilities', item.id, `คุณแน่ใจหรือไม่ที่ต้องการลบหนี้สิน "${item.name}"?`)}
                                                                className="text-red-600 hover:text-red-900"
                                                            >
                                                                ลบ
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>
                )}

                {/* Goals Tab */}
                {activeTab === 'goals' && (
                    <section>
                        <h2 className="text-3xl font-extrabold text-indigo-800 mb-6 text-center">เป้าหมายทางการเงิน</h2>
                        <div className="flex justify-center mb-6">
                            <button
                                onClick={() => { setShowGoalModal(true); resetGoalForm(); }}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition duration-300 transform hover:scale-105"
                            >
                                + เพิ่มเป้าหมายใหม่
                            </button>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                            {goals.length === 0 ? (
                                <p className="text-center text-gray-500 py-10">ยังไม่มีเป้าหมายทางการเงิน</p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {goals.map((goal) => {
                                        const progress = (goal.currentAmount / goal.targetAmount) * 100;
                                        return (
                                            <div key={goal.id} className="bg-gray-50 p-6 rounded-xl shadow-md border border-blue-100 flex flex-col justify-between">
                                                <div>
                                                    <h3 className="text-xl font-semibold text-indigo-700 mb-2">{goal.name}</h3>
                                                    <p className="text-gray-600">เป้าหมาย: <span className="font-bold">{parseFloat(goal.targetAmount).toLocaleString('th-TH')} บาท</span></p>
                                                    <p className="text-gray-600">ปัจจุบัน: <span className="font-bold">{parseFloat(goal.currentAmount).toLocaleString('th-TH')} บาท</span></p>
                                                    <p className="text-gray-600">ประเภท: <span className="font-bold">{goal.type === 'saving' ? 'ออมเงิน' : 'ปลดหนี้'}</span></p>
                                                    {goal.dueDate && <p className="text-gray-600">กำหนด: <span className="font-bold">{goal.dueDate}</span></p>}
                                                </div>
                                                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-4">
                                                    <div
                                                        className="bg-indigo-600 h-2.5 rounded-full"
                                                        style={{ width: `${Math.min(100, progress)}%` }}
                                                    ></div>
                                                </div>
                                                <p className="text-sm text-gray-500 mt-2 text-right">{progress.toFixed(1)}% บรรลุ</p>
                                                <div className="flex justify-end space-x-3 mt-4">
                                                    <button
                                                        onClick={() => editGoal(goal)}
                                                        className="text-indigo-600 hover:text-indigo-900 text-sm"
                                                    >
                                                        แก้ไข
                                                    </button>
                                                    <button
                                                        onClick={() => confirmDelete('goals', goal.id, `คุณแน่ใจหรือไม่ที่ต้องการลบเป้าหมาย "${goal.name}"?`)}
                                                        className="text-red-600 hover:text-red-900"
                                                    >
                                                        ลบ
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </section>
                )}
            </main>

            {/* Transaction Modal */}
            <Modal
                key="transaction-modal"
                show={showTransactionModal}
                onClose={() => { setShowTransactionModal(false); resetTransactionForm(); }}
                title={currentEditingItem.current ? 'แก้ไขรายการ' : 'เพิ่มรายการรายรับ-รายจ่าย'}
            >
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
                            type="text"
                            id="transactionAmount"
                            name="amount"
                            value={formatNumberWithCommas(newTransaction.amount)}
                            onChange={handleTransactionChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="เช่น 500"
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
                            placeholder="เช่น อาหาร, ค่าเดินทาง, เงินเดือน"
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
                            placeholder="เช่น ค่ากาแฟ, ค่ารถเมล์"
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
                            {currentEditingItem.current ? 'บันทึกการแก้ไข' : 'เพิ่มรายการ'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Asset Modal */}
            <Modal
                key="asset-modal"
                show={showAssetModal}
                onClose={() => { setShowAssetModal(false); resetAssetForm(); }}
                title={currentEditingItem.current ? 'แก้ไขสินทรัพย์' : 'เพิ่มสินทรัพย์ใหม่'}
            >
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
                            placeholder="เช่น เงินฝาก, หุ้น, อสังหาฯ"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="assetValue" className="block text-sm font-medium text-gray-700">มูลค่า (บาท)</label>
                        <input
                            type="text"
                            id="assetValue"
                            name="value"
                            value={formatNumberWithCommas(newAsset.value)}
                            onChange={handleAssetChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="เช่น 100000"
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
                            placeholder="เช่น เงินสด, การลงทุน, อสังหาริมทรัพย์"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="assetDate" className="block text-sm font-medium text-gray-700">วันที่เพิ่ม/อัปเดต</label>
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
                            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-200"
                        >
                            {currentEditingItem.current ? 'บันทึกการแก้ไข' : 'เพิ่มสินทรัพย์'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Liability Modal */}
            <Modal
                key="liability-modal"
                show={showLiabilityModal}
                onClose={() => { setShowLiabilityModal(false); resetLiabilityForm(); }}
                title={currentEditingItem.current ? 'แก้ไขหนี้สิน' : 'เพิ่มหนี้สินใหม่'}
            >
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
                            placeholder="เช่น สินเชื่อบ้าน, บัตรเครดิต"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="liabilityAmount" className="block text-sm font-medium text-gray-700">จำนวนเงิน (บาท)</label>
                        <input
                            type="text"
                            id="liabilityAmount"
                            name="amount"
                            value={formatNumberWithCommas(newLiability.amount)}
                            onChange={handleLiabilityChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="เช่น 50000"
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
                            placeholder="เช่น สินเชื่อ, บัตรเครดิต"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="liabilityDate" className="block text-sm font-medium text-gray-700">วันที่เพิ่ม/อัปเดต</label>
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
                        <label htmlFor="liabilityDueDate" className="block text-sm font-medium text-gray-700">วันครบกำหนด (ไม่บังคับ)</label>
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
                            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-200"
                        >
                            {currentEditingItem.current ? 'บันทึกการแก้ไข' : 'เพิ่มหนี้สิน'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Goal Modal */}
            <Modal
                key="goal-modal"
                show={showGoalModal}
                onClose={() => { setShowGoalModal(false); resetGoalForm(); }}
                title={currentEditingItem.current ? 'แก้ไขเป้าหมาย' : 'เพิ่มเป้าหมายใหม่'}
            >
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
                            placeholder="เช่น ออมเงินดาวน์บ้าน, ปลดหนี้บัตรเครดิต"
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
                            <option value="debt repayment">ปลดหนี้</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="goalTargetAmount" className="block text-sm font-medium text-gray-700">จำนวนเงินเป้าหมาย (บาท)</label>
                        <input
                            type="text"
                            id="goalTargetAmount"
                            name="targetAmount"
                            value={formatNumberWithCommas(newGoal.targetAmount)}
                            onChange={handleGoalChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="เช่น 1000000"
                            required
                        />
                    </div>
                    <div>
                        <label htmlFor="goalCurrentAmount" className="block text-sm font-medium text-gray-700">จำนวนเงินปัจจุบัน (บาท)</label>
                        <input
                            type="text"
                            id="goalCurrentAmount"
                            name="currentAmount"
                            value={formatNumberWithCommas(newGoal.currentAmount)}
                            onChange={handleGoalChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                            placeholder="เช่น 0"
                        />
                    </div>
                    <div>
                        <label htmlFor="goalDueDate" className="block text-sm font-medium text-gray-700">วันครบกำหนด (ไม่บังคับ)</label>
                        <input
                            type="date"
                            id="goalDueDate"
                            name="dueDate"
                            value={newGoal.dueDate}
                            onChange={handleGoalChange}
                            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
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
                            {currentEditingItem.current ? 'บันทึกการแก้ไข' : 'เพิ่มเป้าหมาย'}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Confirmation Modal */}
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
