import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppContext } from '../context/AppContext';
import { TrendingUp, AlertTriangle, RefreshCw, BarChart2, ShieldAlert, DollarSign, Wallet, ArrowDownRight, Sparkles, BrainCircuit, Loader2, Clock } from 'lucide-react';
import { 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    PieChart, Pie, Cell, Legend, BarChart, Bar, LineChart, Line
} from 'recharts';
import DateRangePicker, { DateRange } from '../components/DateRangePicker';
import { backupDatabaseToDrive } from "../utils/driveBackup";


const CardSkeleton = () => (
    <div className="bg-white dark:bg-[#0c111e] p-6 rounded-[28px] border border-slate-200/60 dark:border-slate-850/40 shadow-xl shadow-slate-200/20 dark:shadow-slate-900/40 animate-pulse">
        <div className="flex items-center justify-between mb-4">
            <div className="w-10 h-10 bg-slate-200 dark:bg-slate-800 rounded-2xl"></div>
            <div className="w-8 h-8 bg-slate-200 dark:bg-slate-800 rounded-full"></div>
        </div>
        <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/2 mb-2"></div>
        <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-3/4"></div>
    </div>
);

export default function Dashboard() {
    const { user, fetchProducts } = useAppContext();
    const [chartType, setChartType] = useState<'area' | 'bar' | 'line'>('area');
    const [dateRange, setDateRange] = useState<DateRange>({
        startDate: (() => {
            const prior = new Date();
            prior.setDate(prior.getDate() - 6);
            return prior.toISOString().split('T')[0];
        })(),
        endDate: new Date().toISOString().split('T')[0],
        preset: '7days'
    });

    const [stats, setStats] = useState({
        salesToday: 0,
        profitToday: 0,
        lowStock: [] as any[],
        topProducts: [] as any[],
        salesTrend: [] as any[],
        paymentDistribution: [] as any[]
    });

    const [loading, setLoading] = useState(true);
    const [insights, setInsights] = useState<any[]>([]);
    const [loadingInsights, setLoadingInsights] = useState(false);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'warn' | 'error' } | null>(null);

    const showNotification = (message: string, type: 'success' | 'warn' | 'error' = 'success') => {
        setNotification({ message, type });
        setTimeout(() => {
            setNotification(null);
        }, 5000);
    };

    const loadStats = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/dashboard?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}&compare=${!!dateRange.compare}`);
            if (res.ok) {
                const data = await res.json();
                setStats(data);
            }
        } catch (e) {
            console.error("Failure loading stats:", e);
        } finally {
            setLoading(false);
        }
    };

    const loadInsights = async () => {
        setLoadingInsights(true);
        try {
            const res = await fetch(`/api/dashboard/insights?startDate=${dateRange.startDate}&endDate=${dateRange.endDate}`);
            if (res.ok) {
                const data = await res.json();
                setInsights(Array.isArray(data) ? data : []);
            }
        } catch (e) {
            console.error("Failure loading AI insights:", e);
        } finally {
            setLoadingInsights(false);
        }
    };

    useEffect(() => {
        loadStats();
        loadInsights();
    }, [dateRange]);

    useEffect(() => {
        if (user?.role !== 'admin') return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/alerts`;
        console.log("Connecting to Alerts WebSocket at:", wsUrl);

        let socket: WebSocket | null = null;
        let reconnectTimeout: any = null;

        const connect = () => {
            socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                console.log("Alerts WebSocket connection established.");
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'low_stock_alert') {
                        // Show warning notification
                        showNotification(
                            `⚠️ ALERTA DE STOCK: "${data.product.name}" (${data.product.sku}) tiene un stock crítico de ${data.product.stock} unidades (Mínimo: ${data.product.stock_alarm}).`,
                            "warn"
                        );

                        // Dynamically update stats.lowStock in real-time
                        setStats(prev => {
                            const exists = prev.lowStock.some(p => p.id === data.product.id);
                            let updatedLowStock = [...prev.lowStock];
                            if (exists) {
                                updatedLowStock = updatedLowStock.map(p =>
                                    p.id === data.product.id ? { ...p, stock: data.product.stock, stock_alarm: data.product.stock_alarm } : p
                                );
                            } else {
                                updatedLowStock.push({
                                    id: data.product.id,
                                    name: data.product.name,
                                    sku: data.product.sku,
                                    stock: data.product.stock,
                                    stock_alarm: data.product.stock_alarm
                                });
                            }
                            return {
                                ...prev,
                                lowStock: updatedLowStock
                            };
                        });
                    }
                } catch (err) {
                    console.error("Error parsing alert message:", err);
                }
            };

            socket.onclose = () => {
                // Silently attempt reconnect on connection close due to proxy timeouts
                reconnectTimeout = setTimeout(connect, 10000); // increase interval to reduce reconnect traffic
            };

            socket.onerror = () => {
                // Gracefully muffle WebSocket errors to avoid polluting the terminal console in preview sandboxes
            };
        };

        connect();

        return () => {
            if (socket) {
                socket.close();
            }
            if (reconnectTimeout) {
                clearTimeout(reconnectTimeout);
            }
        };
    }, [user]);

    const handleShiftReset = async () => {
        if (user?.role !== 'admin') {
            showNotification("No tienes permisos suficientes para realizar esta acción.", "error");
            return;
        }

        const confirmReset = window.confirm(
            "⚠️ TURN RESET: ¿Deseas realizar el Cierre de Turno y Caja?\n\nEsta acción registrará históricamente la suma obtenida y pondrá a cero ($0.00) las ventas actuales correspondientes a este periodo de trabajo."
        );
        if (!confirmReset) return;

        try {
            const res = await fetch('/api/shifts/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ closed_by: user.id })
            });
            if (res.ok) {
                const data = await res.json();
                showNotification(`✓ Cierre de turno exitoso. Total archivado: $${data.totalClosed.toFixed(2)}. Ventas de caja reiniciadas.`, "success");
                loadStats();
                fetchProducts();
                try {
                    showNotification("Iniciando respaldo en Google Drive...", "success");
                    const backupSuccess = await backupDatabaseToDrive();
                    if (backupSuccess) {
                        showNotification("✓ Respaldo subido exitosamente a Google Drive.", "success");
                    }
                } catch (err: any) {
                    console.error("Backup to Drive failed:", err);
                    showNotification("El respaldo en Google Drive falló: " + err.message, "error");
                }
            } else {
                showNotification("Ocurrió un error al procesar el cierre.", "error");
            }
        } catch (e) {
            console.error(e);
            showNotification("Imposible procesar el cierre en este momento.", "error");
        }
    };

    return (
        <div className="animate-in fade-in zoom-in-95 duration-500 p-5 md:p-6 overflow-y-auto h-full flex flex-col gap-6 relative select-none bg-[#f8fafc]/40 dark:bg-[#070a10]">
            
            {/* Embedded elegant banner notification */}
            {notification && (
                <div id="dashboard-toast" className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl border text-xs font-bold transition-all duration-300 animate-in fade-in slide-in-from-bottom-5 ${
                    notification.type === 'success' 
                        ? 'bg-emerald-600 border-emerald-500 text-white shadow-emerald-555/10' 
                        : notification.type === 'warn'
                        ? 'bg-amber-600 border-amber-500 text-white shadow-amber-500/10'
                        : 'bg-rose-600 border-rose-500 text-white shadow-rose-555/10'
                }`}>
                    <span className="text-sm">{notification.type === 'success' ? '✓' : '⚠️'}</span>
                    <span>{notification.message}</span>
                </div>
            )}

            {/* Header section with minimal elegant frame */}
            <div className="flex justify-between items-center bg-white dark:bg-[#0c111e] p-5 rounded-3xl border border-slate-200/60 dark:border-slate-850/40 backdrop-blur-md">
                <div>
                    <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-ping"></div>
                        <h1 className="text-base font-extrabold text-slate-800 dark:text-white uppercase tracking-wider">Dashboard Gerencial</h1>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5 font-semibold">Métricas de caja, alertas de desabastecimiento e inteligencia analítica en tiempo real.</p>
                </div>
                <button 
                    onClick={loadStats}
                    className="w-10 h-10 flex items-center justify-center bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white rounded-xl hover:scale-105 active:scale-95 transition-all cursor-pointer"
                    title="Actualizar Estadísticas"
                >
                    <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            {/* Bento-style KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Sales metrics card */}
                <div className="bg-white dark:bg-[#0c111e] p-5 rounded-3xl border border-slate-250/50 dark:border-slate-850 flex items-center justify-between shadow-sm hover:shadow-md transition-all">
                    <div>
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Recaudado (Caja Hoy)</span>
                        {loading ? (
                            <div className="h-8 w-28 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse mt-1.5"></div>
                        ) : (
                            <span className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400 mt-1.5 block tracking-tight">Bs. {stats.salesToday.toFixed(2)}</span>
                        )}
                    </div>
                    <div className="w-11 h-11 bg-emerald-500/10 dark:bg-emerald-400/10 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center border border-emerald-500/10">
                        <TrendingUp size={20} />
                    </div>
                </div>

                {/* Low Stock KPI */}
                <div className="bg-white dark:bg-[#0c111e] p-5 rounded-3xl border border-slate-250/50 dark:border-slate-850 flex items-center justify-between shadow-sm hover:shadow-md transition-all">
                    <div>
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block font-sans">Alarmas SKU Críticas</span>
                        {loading ? (
                            <div className="h-8 w-28 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse mt-1.5"></div>
                        ) : (
                            <span className={`text-2xl font-black font-mono mt-1.5 block tracking-tight ${stats.lowStock.length > 0 ? "text-rose-500 animate-pulse" : "text-slate-500 dark:text-slate-400"}`}>
                                {stats.lowStock.length} productos
                            </span>
                        )}
                    </div>
                    <div className="w-11 h-11 bg-rose-500/10 dark:bg-rose-450/10 text-rose-500 dark:text-rose-400 rounded-2xl flex items-center justify-center border border-rose-500/10">
                        <AlertTriangle size={20} />
                    </div>
                </div>

                {/* Real Profit Margin or Restricted View (Sugerencia 4) */}
                {user?.role === 'admin' ? (
                    <div className="bg-white dark:bg-[#0c111e] p-5 rounded-3xl border border-slate-250/50 dark:border-slate-850 flex items-center justify-between shadow-sm hover:shadow-md transition-all animate-in fade-in">
                        <div>
                            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block font-sans">Ganancia Real Neta Hoy</span>
                            {loading ? (
                                <div className="h-8 w-28 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse mt-1.5"></div>
                            ) : (
                                <span className="text-2xl font-black font-mono text-blue-600 dark:text-blue-400 mt-1.5 block tracking-tight">
                                    Bs. {(stats.profitToday || 0).toFixed(2)}
                                </span>
                            )}
                        </div>
                        <div className="w-11 h-11 bg-blue-500/10 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center border border-blue-500/10">
                            <DollarSign size={20} />
                        </div>
                    </div>
                ) : (
                    <div className="bg-slate-50 dark:bg-[#070b13] p-5 rounded-3xl border border-dashed border-slate-200 dark:border-slate-850/80 flex items-center gap-3.5 shadow-inner">
                        <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-900/60 text-slate-400 flex items-center justify-center border border-slate-200/50 dark:border-slate-800">
                            <ShieldAlert size={18} />
                        </div>
                        <div>
                            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Métricas Privadas</span>
                            <span className="text-[10px] font-semibold text-slate-400 block mt-1">Nivel Administrador Requerido</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Quick Metrics Sparklines Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Daily Sales Volume Sparkline Card */}
                <div className="bg-white dark:bg-[#0c111e] p-5 rounded-3xl border border-slate-150 dark:border-slate-850/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm hover:shadow-md transition-all duration-300">
                    <div className="flex-1">
                        <span className="text-[10px] font-black tracking-widest text-[#6366f1] uppercase">📈 Tendencia de Volumen</span>
                        <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-750 dark:text-slate-300 mt-1">Volumen Diario Ventas</h3>
                        {loading ? (
                            <div className="h-7 w-24 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse mt-2"></div>
                        ) : (
                            <div className="mt-1.5 flex items-baseline gap-1.5">
                                <span className="text-xl font-black font-mono text-slate-800 dark:text-slate-100">
                                    Bs. {stats.salesTrend && stats.salesTrend.length > 0 
                                        ? (stats.salesTrend.reduce((acc, curr) => acc + (curr.total || 0), 0) / stats.salesTrend.length).toFixed(2)
                                        : '0.00'}
                                </span>
                                <span className="text-[9px] font-bold text-slate-400 uppercase">Promedio</span>
                            </div>
                        )}
                        <p className="text-[9px] text-slate-400 mt-1 font-semibold leading-none">Comportamiento del flujo transaccional diario.</p>
                    </div>
                    <div className="w-full sm:w-36 h-12 shrink-0">
                        {loading ? (
                            <div className="h-full w-full bg-slate-50 dark:bg-slate-900/40 rounded-xl animate-pulse"></div>
                        ) : stats.salesTrend && stats.salesTrend.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={stats.salesTrend} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                                    <defs>
                                        <linearGradient id="sparkSales" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0}/>
                                        </linearGradient>
                                    </defs>
                                    <Tooltip 
                                        cursor={{ stroke: 'rgba(99, 102, 241, 0.2)', strokeWidth: 2, strokeDasharray: '4 4' }}
                                        contentStyle={{ 
                                            borderRadius: '16px', 
                                            background: 'rgba(15, 23, 42, 0.95)', 
                                            backdropFilter: 'blur(10px)',
                                            color: '#fff', 
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            fontSize: '11px',
                                            fontWeight: '700',
                                            fontFamily: 'monospace',
                                            padding: '8px 12px',
                                            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
                                        }}
                                        formatter={(value: any) => [`Bs. ${Number(value).toFixed(2)}`, 'Ventas']}
                                        labelFormatter={() => ''}
                                    />
                                    <Area 
                                        type="monotone" 
                                        dataKey="total" 
                                        stroke="#6366f1" 
                                        strokeWidth={1.8} 
                                        fillOpacity={1} 
                                        fill="url(#sparkSales)" 
                                        dot={false}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full w-full flex items-center justify-center text-[9px] font-black text-slate-400 uppercase">Sin Datos</div>
                        )}
                    </div>
                </div>

                {/* Profit Trend Sparkline Card */}
                <div className="bg-white dark:bg-[#0c111e] p-5 rounded-3xl border border-slate-150 dark:border-slate-850/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm hover:shadow-md transition-all duration-300">
                    <div className="flex-1">
                        <span className="text-[10px] font-black tracking-widest text-[#10b981] uppercase">💰 Tendencia de Rentabilidad</span>
                        <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-750 dark:text-slate-300 mt-1">Rentabilidad Real Neta</h3>
                        {loading ? (
                            <div className="h-7 w-24 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse mt-2"></div>
                        ) : user?.role === 'admin' ? (
                            <div className="mt-1.5 flex items-baseline gap-1.5">
                                <span className="text-xl font-black font-mono text-slate-800 dark:text-slate-100">
                                    Bs. {stats.salesTrend && stats.salesTrend.length > 0 
                                        ? (stats.salesTrend.reduce((acc, curr) => acc + (curr.profit || 0), 0) / stats.salesTrend.length).toFixed(2)
                                        : '0.00'}
                                </span>
                                <span className="text-[9px] font-bold text-slate-400 uppercase">Promedio</span>
                            </div>
                        ) : (
                            <div className="mt-2 flex items-center gap-1.5 text-slate-450 dark:text-slate-500 font-extrabold text-[9px] uppercase">
                                <ShieldAlert size={11} className="text-slate-400" />
                                <span>Administrador Requerido</span>
                            </div>
                        )}
                        <p className="text-[9px] text-slate-400 mt-1 font-semibold leading-none">Evolución de rentabilidad neta diaria.</p>
                    </div>
                    <div className="w-full sm:w-36 h-12 shrink-0">
                        {loading ? (
                            <div className="h-full w-full bg-slate-50 dark:bg-slate-900/40 rounded-xl animate-pulse"></div>
                        ) : user?.role === 'admin' ? (
                            stats.salesTrend && stats.salesTrend.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={stats.salesTrend} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                                        <defs>
                                            <linearGradient id="sparkProfit" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                                            </linearGradient>
                                        </defs>
                                        <Tooltip 
                                            contentStyle={{ 
                                                borderRadius: '12px', 
                                                background: '#0f172a', 
                                                color: '#fff', 
                                                border: 'none',
                                                fontSize: '9px',
                                                fontWeight: '700',
                                                fontFamily: 'monospace',
                                                padding: '4px 8px'
                                            }}
                                            formatter={(value: any) => [`Bs. ${Number(value).toFixed(2)}`, 'Ganancia']}
                                            labelFormatter={() => ''}
                                        />
                                        <Area 
                                            type="monotone" 
                                            dataKey="profit" 
                                            stroke="#10b981" 
                                            strokeWidth={1.8} 
                                            fillOpacity={1} 
                                            fill="url(#sparkProfit)" 
                                            dot={false}
                                        />
                                    </AreaChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full w-full flex items-center justify-center text-[9px] font-black text-slate-400 uppercase">Sin Datos</div>
                            )
                        ) : (
                            <div className="h-full w-full flex flex-col items-center justify-center border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl bg-slate-50/50 dark:bg-[#070b13] text-[9px] font-black text-slate-400 uppercase select-none p-1 text-center leading-tight">
                                <span>Restringido</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* AI Insights Widget */}
            <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-200/50 dark:border-indigo-500/20 rounded-3xl p-5 shadow-sm relative overflow-hidden">
                <div className="absolute -right-4 -top-4 text-indigo-500/10 dark:text-indigo-500/5">
                    <BrainCircuit size={100} />
                </div>
                <div className="flex items-center justify-between mb-4 relative z-10">
                    <div className="flex items-center gap-2">
                        <BrainCircuit className="text-indigo-600 dark:text-indigo-400" size={20} />
                        <h2 className="text-sm font-extrabold text-indigo-900 dark:text-indigo-100 uppercase tracking-wider">GTR POS AI Manager</h2>
                    </div>
                    {loadingInsights && <Loader2 size={16} className="text-indigo-500 animate-spin" />}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
                    {insights.map((insight, idx) => (
                        <div key={idx} className="bg-white/60 dark:bg-slate-900/40 backdrop-blur-sm p-4 rounded-2xl border border-white/40 dark:border-slate-800/50">
                            <h3 className="font-bold text-xs text-indigo-800 dark:text-indigo-300 uppercase mb-1.5">{insight.title}</h3>
                            <p className="text-xs text-slate-700 dark:text-slate-400 leading-relaxed font-medium">{insight.description}</p>
                        </div>
                    ))}
                    {!loadingInsights && insights.length === 0 && (
                        <div className="col-span-1 md:col-span-3 text-center py-4 text-xs font-bold text-indigo-400 uppercase">Analizando métricas...</div>
                    )}
                </div>
            </div>

            {/* Analíticas Clínicas y Gráficos Visuales de Última Generación */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-2">
                {/* Ventas Últimos 7 Días - AreaChart Comparativa Ventas vs Ganancia */}
                <div className="bg-white dark:bg-[#0c111e] p-5 rounded-3xl border border-slate-150 dark:border-slate-850 flex flex-col gap-4 shadow-sm hover:shadow-md transition-all duration-300">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 pb-2 border-b border-slate-100 dark:border-slate-850/60">
                        <div className="flex-1">
                            <span className="text-[10px] font-black tracking-widest text-[#6366f1] uppercase">📊 Análisis de Rendimiento</span>
                            <h2 className="font-extrabold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300 mt-1">
                                {dateRange.compare ? 'Comparativa de Período Actual vs Período Anterior' : (dateRange.preset === '7days' ? 'Comparativa Ventas vs Ganancia (Última Semana)' : `Comparativa Ventas (${dateRange.startDate} a ${dateRange.endDate})`)}
                            </h2>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 flex-wrap sm:flex-nowrap">
                            {/* Chart Type Toggle */}
                            <div className="flex bg-slate-100 dark:bg-slate-900/60 p-0.5 rounded-xl border border-slate-200/50 dark:border-slate-800">
                                <button 
                                    onClick={() => setChartType('area')} 
                                    className={`px-2.5 py-1 text-[10px] font-black rounded-lg transition-all cursor-pointer ${chartType === 'area' ? 'bg-white dark:bg-[#0c111e] text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-450 dark:text-slate-550 hover:text-slate-650'}`}
                                >
                                    Área
                                </button>
                                <button 
                                    onClick={() => setChartType('bar')} 
                                    className={`px-2.5 py-1 text-[10px] font-black rounded-lg transition-all cursor-pointer ${chartType === 'bar' ? 'bg-white dark:bg-[#0c111e] text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-450 dark:text-slate-550 hover:text-slate-650'}`}
                                >
                                    Barras
                                </button>
                                <button 
                                    onClick={() => setChartType('line')} 
                                    className={`px-2.5 py-1 text-[10px] font-black rounded-lg transition-all cursor-pointer ${chartType === 'line' ? 'bg-white dark:bg-[#0c111e] text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-450 dark:text-slate-550 hover:text-slate-650'}`}
                                >
                                    Líneas
                                </button>
                            </div>
                            <DateRangePicker value={dateRange} onChange={setDateRange} />
                        </div>
                    </div>
                    <div className="h-64 w-full">
                        {stats.salesTrend && stats.salesTrend.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                {chartType === 'area' ? (
                                    <AreaChart data={stats.salesTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25}/>
                                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0}/>
                                            </linearGradient>
                                            <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0.0}/>
                                            </linearGradient>
                                            <linearGradient id="colorCompareSales" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#ec4899" stopOpacity={0.15}/>
                                                <stop offset="95%" stopColor="#ec4899" stopOpacity={0.0}/>
                                            </linearGradient>
                                            <linearGradient id="colorCompareProfit" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.15}/>
                                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:hidden" />
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" className="hidden dark:block" />
                                        <XAxis 
                                            dataKey="label" 
                                            tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <YAxis 
                                            tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <Tooltip 
                                            contentStyle={{ 
                                                borderRadius: '16px', 
                                                background: '#0f172a', 
                                                color: '#fff', 
                                                border: 'none',
                                                fontSize: '11px',
                                                fontWeight: '700',
                                                fontFamily: 'monospace'
                                            }}
                                            formatter={(value: any, name: any, props: any) => {
                                                const entry = props.payload;
                                                if (name === 'total') return [`Bs. ${Number(value).toFixed(2)}`, 'Ventas (Actual)'];
                                                if (name === 'profit') return [`Bs. ${Number(value).toFixed(2)}`, 'Ganancia (Actual)'];
                                                if (name === 'compareTotal') return [`Bs. ${Number(value).toFixed(2)}`, `Ventas (${entry.compareLabel || 'Previo'})`];
                                                if (name === 'compareProfit') return [`Bs. ${Number(value).toFixed(2)}`, `Ganancia (${entry.compareLabel || 'Previo'})`];
                                                return [`Bs. ${Number(value).toFixed(2)}`, name];
                                            }}
                                        />
                                        <Legend 
                                            verticalAlign="top" 
                                            height={36}
                                            iconType="circle"
                                            formatter={(value) => {
                                                if (value === 'total') return <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500 dark:text-slate-400">Ventas (Act)</span>;
                                                if (value === 'profit') return <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500 dark:text-slate-400">Ganancia (Act)</span>;
                                                if (value === 'compareTotal') return <span className="text-[10px] uppercase tracking-wider font-extrabold text-[#ec4899]">Ventas Pres. (Ant)</span>;
                                                if (value === 'compareProfit') return <span className="text-[10px] uppercase tracking-wider font-extrabold text-[#f59e0b]">Ganancia Pres. (Ant)</span>;
                                                return <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500 dark:text-slate-400">{value}</span>;
                                            }}
                                        />
                                        <Area 
                                            type="monotone" 
                                            dataKey="total" 
                                            name="total"
                                            stroke="#6366f1" 
                                            strokeWidth={3} 
                                            fillOpacity={1} 
                                            fill="url(#colorSales)" 
                                        />
                                        {user?.role === 'admin' && (
                                            <Area 
                                                type="monotone" 
                                                dataKey="profit" 
                                                name="profit"
                                                stroke="#10b981" 
                                                strokeWidth={3} 
                                                fillOpacity={1} 
                                                fill="url(#colorProfit)" 
                                            />
                                        )}
                                        {dateRange.compare && (
                                            <>
                                                <Area 
                                                    type="monotone" 
                                                    dataKey="compareTotal" 
                                                    name="compareTotal"
                                                    stroke="#ec4899" 
                                                    strokeWidth={2}
                                                    strokeDasharray="5 5"
                                                    fillOpacity={1} 
                                                    fill="url(#colorCompareSales)" 
                                                />
                                                {user?.role === 'admin' && (
                                                    <Area 
                                                        type="monotone" 
                                                        dataKey="compareProfit" 
                                                        name="compareProfit"
                                                        stroke="#f59e0b" 
                                                        strokeWidth={2}
                                                        strokeDasharray="5 5"
                                                        fillOpacity={1} 
                                                        fill="url(#colorCompareProfit)" 
                                                    />
                                                )}
                                            </>
                                        )}
                                    </AreaChart>
                                ) : chartType === 'bar' ? (
                                    <BarChart data={stats.salesTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:hidden" />
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" className="hidden dark:block" />
                                        <XAxis 
                                            dataKey="label" 
                                            tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <YAxis 
                                            tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <Tooltip 
                                            contentStyle={{ 
                                                borderRadius: '16px', 
                                                background: '#0f172a', 
                                                color: '#fff', 
                                                border: 'none',
                                                fontSize: '11px',
                                                fontWeight: '700',
                                                fontFamily: 'monospace'
                                            }}
                                            formatter={(value: any, name: any, props: any) => {
                                                const entry = props.payload;
                                                if (name === 'total') return [`Bs. ${Number(value).toFixed(2)}`, 'Ventas (Actual)'];
                                                if (name === 'profit') return [`Bs. ${Number(value).toFixed(2)}`, 'Ganancia (Actual)'];
                                                if (name === 'compareTotal') return [`Bs. ${Number(value).toFixed(2)}`, `Ventas (${entry.compareLabel || 'Previo'})`];
                                                if (name === 'compareProfit') return [`Bs. ${Number(value).toFixed(2)}`, `Ganancia (${entry.compareLabel || 'Previo'})`];
                                                return [`Bs. ${Number(value).toFixed(2)}`, name];
                                            }}
                                        />
                                        <Legend 
                                            verticalAlign="top" 
                                            height={36}
                                            iconType="circle"
                                            formatter={(value) => {
                                                if (value === 'total') return <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500 dark:text-slate-400">Ventas (Act)</span>;
                                                if (value === 'profit') return <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500 dark:text-slate-400">Ganancia (Act)</span>;
                                                if (value === 'compareTotal') return <span className="text-[10px] uppercase tracking-wider font-extrabold text-[#ec4899]">Ventas Pres. (Ant)</span>;
                                                if (value === 'compareProfit') return <span className="text-[10px] uppercase tracking-wider font-extrabold text-[#f59e0b]">Ganancia Pres. (Ant)</span>;
                                                return <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500 dark:text-slate-400">{value}</span>;
                                            }}
                                        />
                                        <Bar dataKey="total" name="total" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={30} />
                                        {user?.role === 'admin' && <Bar dataKey="profit" name="profit" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={30} />}
                                        {dateRange.compare && (
                                            <>
                                                <Bar dataKey="compareTotal" name="compareTotal" fill="#ec4899" radius={[4, 4, 0, 0]} maxBarSize={20} />
                                                {user?.role === 'admin' && <Bar dataKey="compareProfit" name="compareProfit" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={20} />}
                                            </>
                                        )}
                                    </BarChart>
                                ) : (
                                    <LineChart data={stats.salesTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:hidden" />
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" className="hidden dark:block" />
                                        <XAxis 
                                            dataKey="label" 
                                            tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <YAxis 
                                            tick={{ fill: '#94a3b8', fontSize: 9, fontWeight: 700 }}
                                            axisLine={false}
                                            tickLine={false}
                                        />
                                        <Tooltip 
                                            contentStyle={{ 
                                                borderRadius: '16px', 
                                                background: '#0f172a', 
                                                color: '#fff', 
                                                border: 'none',
                                                fontSize: '11px',
                                                fontWeight: '700',
                                                fontFamily: 'monospace'
                                            }}
                                            formatter={(value: any, name: any, props: any) => {
                                                const entry = props.payload;
                                                if (name === 'total') return [`Bs. ${Number(value).toFixed(2)}`, 'Ventas (Actual)'];
                                                if (name === 'profit') return [`Bs. ${Number(value).toFixed(2)}`, 'Ganancia (Actual)'];
                                                if (name === 'compareTotal') return [`Bs. ${Number(value).toFixed(2)}`, `Ventas (${entry.compareLabel || 'Previo'})`];
                                                if (name === 'compareProfit') return [`Bs. ${Number(value).toFixed(2)}`, `Ganancia (${entry.compareLabel || 'Previo'})`];
                                                return [`Bs. ${Number(value).toFixed(2)}`, name];
                                            }}
                                        />
                                        <Legend 
                                            verticalAlign="top" 
                                            height={36}
                                            iconType="circle"
                                            formatter={(value) => {
                                                if (value === 'total') return <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500 dark:text-slate-400">Ventas (Act)</span>;
                                                if (value === 'profit') return <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500 dark:text-slate-400">Ganancia (Act)</span>;
                                                if (value === 'compareTotal') return <span className="text-[10px] uppercase tracking-wider font-extrabold text-[#ec4899]">Ventas Pres. (Ant)</span>;
                                                if (value === 'compareProfit') return <span className="text-[10px] uppercase tracking-wider font-extrabold text-[#f59e0b]">Ganancia Pres. (Ant)</span>;
                                                return <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-500 dark:text-slate-400">{value}</span>;
                                            }}
                                        />
                                        <Line type="monotone" dataKey="total" name="total" stroke="#6366f1" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                        {user?.role === 'admin' && <Line type="monotone" dataKey="profit" name="profit" stroke="#10b981" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />}
                                        {dateRange.compare && (
                                            <>
                                                <Line type="monotone" dataKey="compareTotal" name="compareTotal" stroke="#ec4899" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 2 }} />
                                                {user?.role === 'admin' && <Line type="monotone" dataKey="compareProfit" name="compareProfit" stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 2 }} />}
                                            </>
                                        )}
                                    </LineChart>
                                )}
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center py-10">
                                <Sparkles size={24} className="text-slate-350 dark:text-slate-650 animate-pulse mb-2" />
                                <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Sin historial interactivo</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Métodos de Pago - Donut Chart */}
                <div className="bg-white dark:bg-[#0c111e] p-5 rounded-3xl border border-slate-150 dark:border-slate-850 flex flex-col gap-4">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-850/60">
                        <div>
                            <span className="text-[10px] font-black tracking-widest text-emerald-500 uppercase">🍕 Preferencias de Cobro</span>
                            <h2 className="font-extrabold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300 mt-1">Distribución de Métodos de Pago</h2>
                        </div>
                    </div>
                    <div className="h-64 w-full flex flex-col sm:flex-row items-center justify-center gap-6">
                        {stats.paymentDistribution && stats.paymentDistribution.length > 0 ? (
                            <>
                                <div className="w-1/2 h-full min-h-[180px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={stats.paymentDistribution}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={55}
                                                outerRadius={75}
                                                paddingAngle={4}
                                                dataKey="value"
                                            >
                                                {stats.paymentDistribution.map((entry: any, index: number) => {
                                                    const COLORS = ['#10b981', '#3b82f6', '#a855f7', '#f59e0b'];
                                                    return (
                                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                    );
                                                })}
                                            </Pie>
                                            <Tooltip 
                                                contentStyle={{ 
                                                    borderRadius: '16px', 
                                                    background: 'rgba(15, 23, 42, 0.95)', 
                                                    backdropFilter: 'blur(10px)',
                                                    color: '#fff', 
                                                    border: '1px solid rgba(255,255,255,0.1)',
                                                    fontSize: '11px',
                                                    fontWeight: '700',
                                                    fontFamily: 'monospace',
                                                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
                                                }}
                                                formatter={(val: any) => [`Bs. ${Number(val).toFixed(2)}`, 'Total']}
                                                itemStyle={{ color: '#fff' }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex flex-col gap-2.5 text-xs w-full sm:w-1/2">
                                    {stats.paymentDistribution.map((entry: any, index: number) => {
                                        const COLORS = ['#10b981', '#3b82f6', '#a855f7', '#f59e0b'];
                                        const totalMethods = stats.paymentDistribution.reduce((acc: number, entry: any) => acc + entry.value, 0) || 1;
                                        const percentage = ((entry.value / totalMethods) * 105).toFixed(1);
                                        return (
                                            <div key={entry.name} className="flex items-center justify-between p-2 rounded-xl bg-slate-50/55 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-850/50">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                                                    <span className="font-extrabold text-[10.5px] uppercase tracking-tight text-slate-650 dark:text-slate-300">{entry.name}</span>
                                                </div>
                                                <span className="font-mono font-bold text-slate-500 dark:text-slate-400 text-[10px]">{percentage}% (Bs. {entry.value.toFixed(1)})</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center py-10 w-full">
                                <Sparkles size={24} className="text-slate-350 dark:text-slate-650 animate-pulse mb-2" />
                                <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Aún no se registran compras</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Stock alerts */}
                <div className="bg-white dark:bg-[#0c111e] p-5 rounded-3xl border border-slate-150 dark:border-slate-850 flex flex-col gap-4">
                    <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-850/60">
                        <AlertTriangle className="text-rose-500" size={16} />
                        <h2 className="font-extrabold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-350">Stock Mínimo & Abastecimiento</h2>
                    </div>

                    <div className="overflow-y-auto max-h-[250px] flex flex-col gap-3 pr-1">
                        {stats.lowStock.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <Sparkles size={24} className="text-emerald-500 mb-2 opacity-80 animate-bounce" />
                                <p className="text-xs font-bold uppercase text-slate-400">Excelente</p>
                                <p className="text-[11px] text-slate-400 max-w-[200px] mt-1">Todos los artículos del catálogo cuentan con stock suficiente.</p>
                            </div>
                        ) : (
                            stats.lowStock.map(p => (
                                <div key={p.id} className="flex justify-between items-center p-3.5 rounded-2xl bg-rose-50/20 dark:bg-rose-950/10 border border-rose-200/40 dark:border-rose-900/25 text-xs">
                                    <div>
                                        <h4 className="font-bold text-slate-800 dark:text-slate-200 uppercase tracking-tight">{p.name}</h4>
                                        <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">SKU ID: {p.sku}</span>
                                    </div>
                                    <div className="text-right">
                                        <span className="font-extrabold text-sm text-rose-600 dark:text-rose-450 block font-mono">Stock: {p.stock}</span>
                                        <span className="text-[9px] font-bold text-slate-400 block mt-0.5">Alarma: {p.stock_alarm}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Best selling products list */}
                <div className="bg-white dark:bg-[#0c111e] p-5 rounded-3xl border border-slate-150 dark:border-slate-850 flex flex-col gap-4 shadow-sm hover:shadow-md transition-all duration-300">
                    <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-850/60">
                        <BarChart2 className="text-blue-500" size={16} />
                        <h2 className="font-extrabold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-350">Top Artículos Más Vendidos</h2>
                    </div>

                    <div className="overflow-y-auto max-h-[250px] flex flex-col gap-2.5 pr-1">
                        {stats.topProducts.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <Wallet size={24} className="text-slate-300 dark:text-slate-700 mb-2" />
                                <p className="text-xs font-bold uppercase text-slate-400">Sin Movimientos</p>
                                <p className="text-[11px] text-slate-400 max-w-[200px] mt-1">No se registran ventas realizadas en el periodo fiscal activo.</p>
                            </div>
                        ) : (() => {
                            const maxQty = Math.max(...stats.topProducts.map(p => p.total_qty)) || 1;
                            return stats.topProducts.map((p, index) => {
                                const ratio = (p.total_qty / maxQty) * 100;
                                return (
                                    <div key={p.name} className="relative overflow-hidden flex items-center justify-between p-3.5 rounded-2xl bg-slate-50/45 dark:bg-[#070b13]/40 text-xs border border-slate-100 dark:border-slate-850/30 transition-all hover:scale-[1.01]">
                                        {/* Subtle Progress Bar Background */}
                                        <div 
                                            className="absolute left-0 top-0 bottom-0 bg-[#6366f1]/10 dark:bg-[#6366f1]/15 transition-all duration-500 rounded-l-2xl" 
                                            style={{ width: `${ratio}%` }}
                                        ></div>
                                        <div className="flex items-center gap-3 relative z-10">
                                            <span className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-black flex items-center justify-center font-mono border border-indigo-550/10">
                                                #{index + 1}
                                            </span>
                                            <span className="font-bold text-slate-800 dark:text-slate-100 uppercase tracking-tight truncate max-w-[150px]">{p.name}</span>
                                        </div>
                                        <span className="font-extrabold text-xs font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-600/5 px-2.5 py-1 rounded-xl border border-indigo-500/10 relative z-10">
                                            {p.total_qty} u
                                        </span>
                                    </div>
                                );
                            });
                        })()}
                    </div>
                </div>
            </div>

            {/* Patrón de Ventas por Hora */}
            <div className="grid grid-cols-1 gap-5 mt-2">
                <div className="bg-white dark:bg-[#0c111e] p-5 rounded-3xl border border-slate-150 dark:border-slate-850 flex flex-col gap-4 shadow-sm hover:shadow-md transition-all duration-300">
                    <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-850/60">
                        <Clock className="text-purple-500" size={16} />
                        <h2 className="font-extrabold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-350">Patrón de Ventas por Hora</h2>
                    </div>
                    <div className="h-[220px] w-full">
                        {stats.hourlySales && stats.hourlySales.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.hourlySales} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" className="hidden dark:block" />
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:hidden" />
                                    <XAxis dataKey="hour" tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={(val) => `${val}:00`} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                    <Tooltip contentStyle={{ borderRadius: '16px', background: '#0f172a', color: '#fff', border: 'none', fontSize: '11px', fontWeight: '700', fontFamily: 'monospace' }} formatter={(val: any) => [`Bs. ${Number(val).toFixed(2)}`, 'Ventas']} labelFormatter={(val) => `Hora: ${val}:00`} />
                                    <Bar dataKey="total" fill="#a855f7" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center py-10 w-full">
                                <Sparkles size={24} className="text-slate-350 dark:text-slate-650 animate-pulse mb-2" />
                                <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Aún no se registran compras por hora</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Turn reset / Caja protection controls for administrators */}
            <div className="bg-white dark:bg-[#0c111e] p-5 rounded-3xl border border-slate-150 dark:border-slate-850 flex flex-col md:flex-row items-center justify-between gap-4 mt-2">
                <div>
                    <h3 className="font-extrabold text-xs uppercase tracking-widest text-[#2c3e50] dark:text-[#a5b4fc]">Corte de Caja Financiero</h3>
                    <p className="text-[11px] text-slate-400 font-semibold mt-1.5 max-w-xl">
                        Registra permanentemente las ventas acumuladas por el cajero activo en un bloque histórico de balance, y de inmediato reestablece el saldo parcial de caja a $0.00.
                    </p>
                </div>
                {user?.role === 'admin' ? (
                    <button 
                        onClick={handleShiftReset}
                        className="py-3 px-5 bg-rose-600 hover:bg-rose-500 hover:scale-[1.01] active:scale-95 text-white font-extrabold text-xs rounded-2xl shadow-lg shadow-rose-600/15 border border-rose-500 transition-all duration-200 cursor-pointer"
                    >
                        Ejecutar Cierre de Turno & Caja
                    </button>
                ) : (
                    <div className="text-[10px] bg-slate-100 dark:bg-[#070c14] text-slate-400 p-3 rounded-2xl border border-slate-200 dark:border-slate-850 font-bold uppercase tracking-wider">
                        🔒 Requiere credenciales de Admin
                    </div>
                )}
            </div>
        </div>
    );
}
