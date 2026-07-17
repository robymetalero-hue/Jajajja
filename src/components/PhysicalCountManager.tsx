import React, { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { 
  ClipboardCheck, Clock, CheckCircle, AlertTriangle, Play, X, Trash2, 
  Save, Eye, RefreshCw, Sparkles, Filter, Search, Check, Ban, ChevronDown, ChevronUp, AlertOctagon, Undo, ChevronRight
} from 'lucide-react';

interface PhysicalCountManagerProps {
  onClose: () => void;
}

interface InventoryCount {
  id: number;
  user_id: number;
  username: string;
  created_at: string;
  status: 'en_progreso' | 'completado' | 'aprobado' | 'cerrado' | 'pausado' | 'finalizado';
  category_filter: string | null;
  approved_at: string | null;
  approved_by_username: string | null;
}

interface CountItem {
  id: number;
  inventory_count_id: number;
  product_id: number;
  product_name: string;
  product_sku: string;
  product_category: string;
  system_stock: number;
  counted_stock: number;
  had_movements_during_count: number;
  is_checked: number;
  status: string;
  notes?: string | null;
}

export default function PhysicalCountManager({ onClose }: PhysicalCountManagerProps) {
  const { user, products, fetchProducts, showNotification } = useAppContext();
  const isAdmin = user?.role === 'admin' || user?.role === 'propietario';

  const [activeTab, setActiveTab] = useState<'activo' | 'historico'>('activo');
  const [activeSession, setActiveSession] = useState<InventoryCount | null>(null);
  const [sessionItems, setSessionItems] = useState<CountItem[]>([]);
  const [historicalCounts, setHistoricalCounts] = useState<InventoryCount[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // New session config
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [categories, setCategories] = useState<string[]>([]);

  // Filtering active count items
  const [itemSearch, setItemSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<'todos' | 'pendientes' | 'revisados' | 'diferencias'>('todos');
  const [hideRevisados, setHideRevisados] = useState(false);

  // Expanded product movements
  const [expandedMovements, setExpandedMovements] = useState<Record<number, boolean>>({});
  const [movementsByProduct, setMovementsByProduct] = useState<Record<number, any[]>>({});
  const [loadingMovements, setLoadingMovements] = useState<Record<number, boolean>>({});

  // Selected historic count view
  const [selectedHistoricCount, setSelectedHistoricCount] = useState<InventoryCount | null>(null);
  const [historicItems, setHistoricItems] = useState<CountItem[]>([]);

  // Extra notes for admin approval
  const [adminNotes, setAdminNotes] = useState('');

  // Fetch initial data
  useEffect(() => {
    fetchProducts();
    fetchActiveSession();
    fetchHistory();
  }, [activeTab]);

  useEffect(() => {
    if (products && products.length > 0) {
      const uniqueCats = Array.from(new Set(products.map(p => p.category || 'Sin Categoría')));
      setCategories(uniqueCats);
    }
  }, [products]);

  const fetchActiveSession = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/inventory-counts');
      if (res.ok) {
        const counts: InventoryCount[] = await res.json();
        // Look for any un-conciliated session
        const active = counts.find(c => c.status === 'en_progreso' || c.status === 'completado' || c.status === 'pausado' || c.status === 'finalizado');
        if (active) {
          setActiveSession(active);
          fetchSessionItems(active.id);
        } else {
          setActiveSession(null);
          setSessionItems([]);
        }
      }
    } catch (err) {
      console.error("Error fetching active session:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/inventory-counts');
      if (res.ok) {
        const counts: InventoryCount[] = await res.json();
        const historic = counts.filter(c => c.status === 'aprobado' || c.status === 'cerrado');
        setHistoricalCounts(historic);
      }
    } catch (err) {
      console.error("Error fetching history:", err);
    }
  };

  const fetchSessionItems = async (countId: number, isHistoric = false) => {
    try {
      const res = await fetch(`/api/inventory-counts/${countId}`);
      if (res.ok) {
        const data = await res.json();
        const mapItems = (items: any[]) => items.map(it => {
          const prodObj = products?.find(p => p.id === it.product_id);
          return {
            ...it,
            system_stock: it.expected_quantity,
            counted_stock: it.physical_quantity,
            product_category: prodObj?.category || 'Sin Categoría',
            is_checked: it.status !== 'pendiente' ? 1 : 0
          };
        });

        if (isHistoric) {
          setHistoricItems(mapItems(data.items || []));
        } else {
          setSessionItems(mapItems(data.items || []));
        }
      }
    } catch (err) {
      console.error("Error fetching items:", err);
    }
  };

  const handleStartSession = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/inventory-counts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(user?.id || 1),
          'x-user-role': user?.role || ''
        },
        body: JSON.stringify({
          category_filter: selectedCategory === 'Todos' ? null : selectedCategory
        })
      });

      if (res.ok) {
        showNotification?.("✓ Nueva sesión de conteo físico iniciada con éxito.", "success");
        await fetchActiveSession();
      } else {
        const err = await res.json();
        showNotification?.(`Error al iniciar sesión: ${err.error}`, "error");
      }
    } catch (err) {
      console.error(err);
      showNotification?.("Fallo de red al crear sesión.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateItem = async (itemId: number, updatedFields: { counted_stock?: number; is_checked?: number; status?: string; notes?: string }) => {
    if (!activeSession) return;
    const item = sessionItems.find(it => it.id === itemId);
    if (!item) return;

    const newStock = updatedFields.counted_stock !== undefined ? updatedFields.counted_stock : item.counted_stock;
    const nextChecked = updatedFields.is_checked !== undefined ? updatedFields.is_checked : item.is_checked;
    
    let nextStatus = item.status;
    if (updatedFields.status !== undefined) {
      nextStatus = updatedFields.status;
    } else if (updatedFields.is_checked !== undefined) {
      if (nextChecked === 0) {
        nextStatus = 'pendiente';
      } else {
        const diff = newStock - item.system_stock;
        nextStatus = diff === 0 ? 'correcto' : 'diferencia';
      }
    } else {
      const diff = newStock - item.system_stock;
      nextStatus = diff === 0 ? 'correcto' : 'diferencia';
    }

    // Local optimistic state update
    setSessionItems(prev => prev.map(it => it.id === itemId ? { 
      ...it, 
      counted_stock: newStock,
      is_checked: nextStatus !== 'pendiente' ? 1 : 0,
      status: nextStatus,
      notes: updatedFields.notes !== undefined ? updatedFields.notes : it.notes
    } : it));

    try {
      const res = await fetch(`/api/inventory-counts/${activeSession.id}/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          physical_quantity: newStock,
          status: nextStatus,
          notes: updatedFields.notes !== undefined ? updatedFields.notes : item.notes
        })
      });
      if (!res.ok) {
        console.error("Failed to update item on server database");
      }
    } catch (err) {
      console.error("Network error while updating item:", err);
    }
  };

  const handleToggleCheck = async (item: CountItem) => {
    if (item.counted_stock === null || item.counted_stock === undefined || isNaN(item.counted_stock)) {
      showNotification?.("Ingresa la cantidad física antes de marcar este producto.", "error");
      return;
    }

    const isChecked = item.is_checked === 1;
    const nextChecked = isChecked ? 0 : 1;
    
    await handleUpdateItem(item.id, { is_checked: nextChecked });

    if (nextChecked === 1) {
      // Auto-scroll gently to the next unchecked item card
      setTimeout(() => {
        const currentIndex = sessionItems.findIndex(it => it.id === item.id);
        const nextUnchecked = sessionItems.slice(currentIndex + 1).find(it => it.is_checked === 0);
        if (nextUnchecked) {
          const el = document.getElementById(`product-card-${nextUnchecked.id}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }, 350);
    }
  };

  const fetchProductMovements = async (productId: number) => {
    setLoadingMovements(prev => ({ ...prev, [productId]: true }));
    try {
      const res = await fetch(`/api/products/${productId}/stock-history`);
      if (res.ok) {
        const data = await res.json();
        setMovementsByProduct(prev => ({ ...prev, [productId]: data }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMovements(prev => ({ ...prev, [productId]: false }));
    }
  };

  const toggleMovements = (item: CountItem) => {
    const isExpanded = !!expandedMovements[item.product_id];
    setExpandedMovements(prev => ({ ...prev, [item.product_id]: !isExpanded }));
    if (!isExpanded) {
      fetchProductMovements(item.product_id);
    }
  };

  const handleCompleteSession = async () => {
    if (!activeSession) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/inventory-counts/${activeSession.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'completado' })
      });

      if (res.ok) {
        showNotification?.("✓ Conteo físico finalizado. El reporte ha sido enviado al administrador.", "success");
        await fetchActiveSession();
        await fetchHistory();
      } else {
        showNotification?.("No se pudo completar el conteo físico.", "error");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveCount = async () => {
    if (!activeSession) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/inventory-counts/${activeSession.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': String(user?.id || 1),
          'x-user-role': user?.role || ''
        },
        body: JSON.stringify({
          admin_id: user?.id,
          admin_username: user?.username,
          notes: adminNotes || 'Conciliación aprobada sin discrepancias mayores.'
        })
      });

      if (res.ok) {
        showNotification?.("✓ Ajustes físicos de inventario aprobados y aplicados correctamente en el almacén.", "success");
        setAdminNotes('');
        await fetchActiveSession();
        await fetchProducts();
        await fetchHistory();
      } else {
        const err = await res.json();
        showNotification?.(`Error al aprobar: ${err.error}`, "error");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelSession = async () => {
    if (!activeSession) return;
    if (!confirm("¿Está seguro que desea cancelar esta sesión de conteo? Se perderán permanentemente los registros no aprobados.")) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/inventory-counts/${activeSession.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelado' })
      });
      if (res.ok) {
        showNotification?.("Sesión de conteo cancelada.", "success");
        setActiveSession(null);
        setSessionItems([]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewHistoricCount = (count: InventoryCount) => {
    setSelectedHistoricCount(count);
    fetchSessionItems(count.id, true);
  };

  // Helper metrics
  const getDiscrepancySummary = (itemsList: CountItem[]) => {
    const totalItems = itemsList.length;
    const checkedItems = itemsList.filter(it => it.is_checked === 1).length;
    const pendingItems = totalItems - checkedItems;
    const productsWithDiff = itemsList.filter(it => it.is_checked === 1 && it.counted_stock !== it.system_stock).length;
    const totalSystemStock = itemsList.reduce((sum, it) => sum + it.system_stock, 0);
    const totalCountedStock = itemsList.reduce((sum, it) => sum + (it.is_checked === 1 ? it.counted_stock : 0), 0);
    const totalDiscrepancyUnits = totalCountedStock - totalSystemStock;
    const completedPercent = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

    return {
      totalItems,
      checkedItems,
      pendingItems,
      productsWithDiff,
      totalSystemStock,
      totalCountedStock,
      totalDiscrepancyUnits,
      completedPercent
    };
  };

  const activeSummary = getDiscrepancySummary(sessionItems);
  const historicSummary = getDiscrepancySummary(historicItems);

  // Filter items in active session
  const filteredItems = sessionItems.filter(it => {
    const matchesSearch = (it.product_name || '').toLowerCase().includes(itemSearch.toLowerCase()) || 
                          (it.product_sku || '').toLowerCase().includes(itemSearch.toLowerCase());
    
    let matchesFilter = true;
    if (activeFilter === 'pendientes') {
      matchesFilter = it.is_checked === 0;
    } else if (activeFilter === 'revisados') {
      matchesFilter = it.is_checked === 1;
    } else if (activeFilter === 'diferencias') {
      matchesFilter = it.is_checked === 1 && it.counted_stock !== it.system_stock;
    }

    const matchesHideRevisados = !hideRevisados || it.is_checked === 0;

    return matchesSearch && matchesFilter && matchesHideRevisados;
  });

  const getStatusDisplay = (status: string, diff: number, isChecked: boolean) => {
    if (!isChecked) {
      return { label: 'Pendiente', bg: 'bg-slate-100 dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-800' };
    }
    if (status === 'no_encontrado') {
      return { label: 'No Encontrado', bg: 'bg-amber-100/80 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800' };
    }
    if (status === 'requiere_revision') {
      return { label: 'Revisión', bg: 'bg-purple-100/80 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800' };
    }
    if (diff === 0) {
      return { label: 'Correcto', bg: 'bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' };
    }
    return diff > 0 
      ? { label: 'Sobrante', bg: 'bg-blue-100/80 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800' }
      : { label: 'Faltante', bg: 'bg-rose-100/80 dark:bg-rose-900/40 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800' };
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center p-0 md:p-4 z-45 animate-in fade-in duration-200">
      <div 
        id="physical-count-screen"
        className="bg-slate-50 dark:bg-[#0c111e] w-full h-[100dvh] md:h-auto md:max-h-[92vh] md:max-w-5xl md:rounded-3xl border-0 md:border border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl overflow-hidden"
      >
        
        {/* SECCIÓN 1: ENCABEZADO (Compacto y responsivo) */}
        <div className="p-4 md:p-5 border-b border-slate-200 dark:border-slate-800/80 flex justify-between items-center bg-white dark:bg-[#0f1626] shrink-0 select-none">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-450 rounded-xl shrink-0">
              <ClipboardCheck size={20} />
            </div>
            <div>
              <h3 className="font-extrabold text-sm md:text-base text-slate-850 dark:text-white uppercase tracking-tight leading-none">
                Control físico de almacén
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium mt-1 leading-none">
                Revisa las cantidades físicas y marca cada producto como verificado.
              </p>
            </div>
          </div>
          <button 
            id="btn-close-physical-count"
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-650 dark:hover:text-white p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-850 transition cursor-pointer shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        {/* Pestañas superiores (Activo / Histórico) */}
        <div className="px-4 md:px-5 flex gap-1 border-b border-slate-200 dark:border-slate-800/40 bg-white/60 dark:bg-black/10 py-1.5 shrink-0 select-none">
          <button
            onClick={() => { setActiveTab('activo'); setSelectedHistoricCount(null); }}
            className={`px-4 py-2 text-[10.5px] uppercase tracking-wider font-black rounded-xl transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'activo' 
                ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400' 
                : 'text-slate-450 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Play size={13} />
            Sesión de Conteo Activa
          </button>
          <button
            onClick={() => { setActiveTab('historico'); setSelectedHistoricCount(null); }}
            className={`px-4 py-2 text-[10.5px] uppercase tracking-wider font-black rounded-xl transition flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'historico' 
                ? 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400' 
                : 'text-slate-450 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <Clock size={13} />
            Historial de Auditorías
          </button>
        </div>

        {/* CONTENIDO PRINCIPAL CON UN SOLO SCROLL DE SOPORTE */}
        <div className="flex-1 overflow-y-auto min-h-0 flex flex-col p-4 md:p-5 gap-4">
          
          {activeTab === 'activo' && (
            <div className="flex-1 flex flex-col gap-4 min-h-0">
              
              {/* CASO A: NO HAY SESIÓN ACTIVA */}
              {!activeSession && (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 md:p-12 bg-white dark:bg-[#101726]/40 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl gap-5">
                  <div className="p-4 bg-indigo-500/5 dark:bg-indigo-500/10 rounded-full text-indigo-500">
                    <ClipboardCheck size={48} />
                  </div>
                  <div className="max-w-md">
                    <h4 className="font-extrabold text-sm md:text-base text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                      No hay ningún control físico activo
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium leading-relaxed">
                      Inicia una auditoría de inventario físico para contrastar las existencias reales en los anaqueles contra las existencias registradas en el sistema.
                    </p>
                  </div>

                  <div className="bg-white dark:bg-[#11192e] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-sm w-full flex flex-col gap-4 shadow-sm">
                    <div className="flex flex-col gap-2 text-left">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Alcance del conteo físico:</label>
                      <select
                        value={selectedCategory}
                        onChange={e => setSelectedCategory(e.target.value)}
                        className="text-xs font-bold p-3 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#151f32] text-slate-850 dark:text-white rounded-xl focus:outline-none focus:border-indigo-500"
                      >
                        <option value="Todos">Todos los productos (Recomendado)</option>
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{cat.toUpperCase()}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      onClick={handleStartSession}
                      disabled={isLoading}
                      className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs uppercase rounded-xl tracking-wider shadow-lg transition active:scale-98 cursor-pointer select-none"
                    >
                      {isLoading ? 'Iniciando...' : 'Iniciar Sesión de Conteo'}
                    </button>
                  </div>
                </div>
              )}

              {/* CASO B: LA SESIÓN HA SIDO ENVIADA POR EL VENDEDOR (COMPLETADO) */}
              {activeSession && activeSession.status === 'completado' && (
                <div className="flex-1 flex flex-col items-center justify-center gap-6 py-6 md:py-10 max-w-xl mx-auto w-full select-none">
                  
                  {/* WORKER VIEW SUCCESS BANNER */}
                  {!isAdmin ? (
                    <div className="bg-white dark:bg-[#11192e] p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col items-center text-center gap-5 w-full">
                      <div className="p-4 bg-emerald-500/10 text-emerald-500 rounded-full">
                        <CheckCircle size={44} />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-base md:text-lg text-slate-850 dark:text-white uppercase tracking-tight">
                          Conteo enviado correctamente
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium max-w-sm mx-auto leading-relaxed">
                          La sesión ha sido finalizada y enviada con éxito. Actualmente se encuentra pendiente de revisión administrativa.
                        </p>
                      </div>

                      {/* Summary Metrics */}
                      <div className="grid grid-cols-2 gap-3 w-full bg-slate-50 dark:bg-black/25 p-4 rounded-2xl border border-slate-200/50 dark:border-slate-850 text-left mt-1">
                        <div>
                          <span className="text-[9px] font-black uppercase text-slate-400">Productos Revisados</span>
                          <div className="font-mono font-bold text-xs text-slate-800 dark:text-white mt-0.5">
                            {activeSummary.checkedItems} / {activeSummary.totalItems}
                          </div>
                        </div>
                        <div>
                          <span className="text-[9px] font-black uppercase text-slate-400">Productos Correctos</span>
                          <div className="font-mono font-bold text-xs text-emerald-600 mt-0.5">
                            {sessionItems.filter(it => it.counted_stock === it.system_stock).length}
                          </div>
                        </div>
                        <div>
                          <span className="text-[9px] font-black uppercase text-slate-400">Con Diferencias</span>
                          <div className="font-mono font-bold text-xs text-rose-500 mt-0.5">
                            {activeSummary.productsWithDiff}
                          </div>
                        </div>
                        <div>
                          <span className="text-[9px] font-black uppercase text-slate-400">Diferencia Neta</span>
                          <div className={`font-mono font-bold text-xs mt-0.5 ${
                            activeSummary.totalDiscrepancyUnits === 0 
                              ? 'text-slate-550' 
                              : activeSummary.totalDiscrepancyUnits > 0 ? 'text-indigo-500' : 'text-rose-500'
                          }`}>
                            {activeSummary.totalDiscrepancyUnits > 0 ? `+${activeSummary.totalDiscrepancyUnits}` : activeSummary.totalDiscrepancyUnits} u
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2.5 w-full">
                        <span className="px-3 py-1 bg-amber-500/10 text-amber-600 border border-amber-500/20 rounded-xl text-[9.5px] uppercase font-black tracking-wider self-center">
                          Estado: Pendiente de Aprobación
                        </span>
                        <p className="text-[10px] text-slate-450 leading-relaxed font-semibold">
                          El inventario real físico no se modificará en las existencias generales hasta que el administrador del negocio valide y aplique los ajustes sugeridos.
                        </p>
                      </div>

                      <div className="w-full flex gap-3 mt-2">
                        <button
                          onClick={onClose}
                          className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 dark:hover:bg-slate-800 dark:text-white text-slate-700 font-extrabold text-xs uppercase rounded-xl transition cursor-pointer"
                        >
                          Cerrar Pantalla
                        </button>
                      </div>
                    </div>
                  ) : (
                    
                    /* ADMIN VIEW FOR RECONCILIATION */
                    <div className="bg-white dark:bg-[#11192e] p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl flex flex-col gap-5 w-full select-none">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-amber-500/10 text-amber-600 rounded-xl">
                          <AlertTriangle size={22} className="animate-pulse" />
                        </div>
                        <div>
                          <h4 className="font-extrabold text-sm md:text-base text-slate-850 dark:text-white uppercase tracking-tight">
                            Conciliación de Inventario (Administrador)
                          </h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">
                            Conteo enviado por <span className="text-indigo-650 dark:text-indigo-400">@{activeSession.username}</span>. Revisa y concilia las discrepancias registradas.
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2 bg-slate-50 dark:bg-black/35 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-800 text-center">
                        <div>
                          <span className="text-[8px] font-black uppercase text-slate-400">Total</span>
                          <div className="font-mono font-bold text-xs text-slate-800 dark:text-slate-200 mt-1">{activeSummary.totalItems}</div>
                        </div>
                        <div>
                          <span className="text-[8px] font-black uppercase text-slate-400">Correctos</span>
                          <div className="font-mono font-bold text-xs text-emerald-500 mt-1">{sessionItems.filter(it => it.counted_stock === it.system_stock).length}</div>
                        </div>
                        <div>
                          <span className="text-[8px] font-black uppercase text-slate-400">Diferencias</span>
                          <div className="font-mono font-bold text-xs text-rose-500 mt-1">{activeSummary.productsWithDiff}</div>
                        </div>
                        <div>
                          <span className="text-[8px] font-black uppercase text-slate-400">Neto</span>
                          <div className={`font-mono font-bold text-xs mt-1 ${activeSummary.totalDiscrepancyUnits >= 0 ? 'text-indigo-500' : 'text-rose-500'}`}>
                            {activeSummary.totalDiscrepancyUnits > 0 ? `+${activeSummary.totalDiscrepancyUnits}` : activeSummary.totalDiscrepancyUnits} u
                          </div>
                        </div>
                      </div>

                      {/* Display products with differences */}
                      <div className="flex-1 flex flex-col gap-2">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 pl-1">Listado de productos con discrepancia:</span>
                        <div className="max-h-[220px] overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-black/10">
                          {sessionItems.filter(it => it.counted_stock !== it.system_stock).map(it => {
                            const diff = it.counted_stock - it.system_stock;
                            return (
                              <div key={it.id} className="p-3 flex justify-between items-center text-xs">
                                <div className="max-w-[70%]">
                                  <div className="font-extrabold text-slate-800 dark:text-slate-200 uppercase truncate">{it.product_name}</div>
                                  <div className="text-[9px] text-slate-450 dark:text-slate-400 font-mono mt-0.5">SKU: {it.product_sku || 'N/A'}</div>
                                  {it.notes && (
                                    <div className="text-[9px] italic text-slate-500 mt-1">Obs: "{it.notes}"</div>
                                  )}
                                </div>
                                <div className="text-right">
                                  <div className="font-mono text-[10px] text-slate-500">Sis: {it.system_stock} | Fís: {it.counted_stock}</div>
                                  <div className={`font-mono font-bold mt-0.5 ${diff > 0 ? 'text-indigo-500' : 'text-rose-500'}`}>
                                    {diff > 0 ? `+${diff}` : diff} unidades
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {sessionItems.filter(it => it.counted_stock !== it.system_stock).length === 0 && (
                            <div className="p-8 text-center text-slate-450 font-semibold text-xs uppercase tracking-wide">
                              ✓ El conteo físico coincidió perfectamente con el sistema.
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Administration Notes */}
                      <div className="flex flex-col gap-1.5 text-left">
                        <label className="text-[9.5px] font-black uppercase tracking-wider text-slate-400">Observaciones de la Conciliación:</label>
                        <input
                          type="text"
                          placeholder="Notas administrativas para registrar en el historial..."
                          value={adminNotes}
                          onChange={e => setAdminNotes(e.target.value)}
                          className="text-xs p-3 border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#151f32] text-slate-800 dark:text-white rounded-xl focus:outline-none focus:border-indigo-500 w-full"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <button
                          onClick={handleCancelSession}
                          className="py-3 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/20 text-rose-600 font-extrabold text-xs uppercase rounded-xl transition cursor-pointer"
                        >
                          Rechazar / Cancelar Conteo
                        </button>
                        <button
                          onClick={handleApproveCount}
                          disabled={isLoading}
                          className="py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs uppercase rounded-xl transition shadow-lg shadow-emerald-650/10 cursor-pointer"
                        >
                          {isLoading ? 'Guardando...' : 'Aprobar & Reconciliar'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* CASO C: SESIÓN DE CONTEO EN PROGRESO (CHECKLIST ACTIVO) */}
              {activeSession && activeSession.status !== 'completado' && (
                <div className="flex-1 flex flex-col gap-4 min-h-0">
                  
                  {/* SECCIÓN 2: PROGRESO (Tarjeta compacta y separada) */}
                  <div className="bg-white dark:bg-[#101726]/70 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shrink-0 shadow-sm select-none">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Progreso del conteo</span>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">{activeSummary.checkedItems}</span>
                          <span className="text-xs font-bold text-slate-450 dark:text-slate-400">de {activeSummary.totalItems} revisados</span>
                        </div>
                      </div>

                      {/* Stat Grid */}
                      <div className="grid grid-cols-3 gap-3 md:gap-6 bg-slate-50 dark:bg-black/20 px-3.5 py-2 rounded-xl border border-slate-150/60 dark:border-slate-850">
                        <div>
                          <span className="text-[8px] font-black uppercase text-slate-400 block leading-none">Pendientes</span>
                          <span className="font-mono font-bold text-xs text-slate-750 dark:text-slate-200 block mt-1">{activeSummary.pendingItems} pz</span>
                        </div>
                        <div>
                          <span className="text-[8px] font-black uppercase text-slate-400 block leading-none">Con diferencias</span>
                          <span className={`font-mono font-bold text-xs block mt-1 ${activeSummary.productsWithDiff > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {activeSummary.productsWithDiff} pz
                          </span>
                        </div>
                        <div>
                          <span className="text-[8px] font-black uppercase text-slate-400 block leading-none">Completado</span>
                          <span className="font-mono font-black text-xs text-emerald-500 block mt-1">{activeSummary.completedPercent}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mt-3">
                      <div 
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${activeSummary.completedPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* SECCIÓN 3: BUSCADOR Y FILTROS */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0 select-none bg-white dark:bg-[#101726]/40 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-800">
                    {/* Buscador */}
                    <div className="relative w-full md:max-w-xs">
                      <input
                        type="text"
                        placeholder="Buscar por producto o SKU..."
                        value={itemSearch}
                        onChange={e => setItemSearch(e.target.value)}
                        className="pl-9 pr-4 py-2 w-full bg-white dark:bg-[#151f32] border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:border-indigo-500 dark:text-white text-xs font-semibold h-10"
                      />
                      <Search className="absolute left-3 top-3 text-slate-400" size={14} />
                    </div>

                    {/* Filtros simples como etiquetas/botones compactos */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => setActiveFilter('todos')}
                        className={`px-3.5 py-1.5 rounded-xl text-[10px] uppercase font-black tracking-wider border cursor-pointer transition ${
                          activeFilter === 'todos'
                            ? 'bg-indigo-650 text-white border-indigo-650'
                            : 'bg-white dark:bg-[#151f32] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-850 hover:bg-slate-50'
                        }`}
                      >
                        Todos ({sessionItems.length})
                      </button>
                      <button
                        onClick={() => setActiveFilter('pendientes')}
                        className={`px-3.5 py-1.5 rounded-xl text-[10px] uppercase font-black tracking-wider border cursor-pointer transition ${
                          activeFilter === 'pendientes'
                            ? 'bg-indigo-650 text-white border-indigo-650'
                            : 'bg-white dark:bg-[#151f32] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-850 hover:bg-slate-50'
                        }`}
                      >
                        Pendientes ({activeSummary.pendingItems})
                      </button>
                      <button
                        onClick={() => setActiveFilter('revisados')}
                        className={`px-3.5 py-1.5 rounded-xl text-[10px] uppercase font-black tracking-wider border cursor-pointer transition ${
                          activeFilter === 'revisados'
                            ? 'bg-indigo-650 text-white border-indigo-650'
                            : 'bg-white dark:bg-[#151f32] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-850 hover:bg-slate-50'
                        }`}
                      >
                        Revisados ({activeSummary.checkedItems})
                      </button>
                      <button
                        onClick={() => setActiveFilter('diferencias')}
                        className={`px-3.5 py-1.5 rounded-xl text-[10px] uppercase font-black tracking-wider border cursor-pointer transition ${
                          activeFilter === 'diferencias'
                            ? 'bg-indigo-650 text-white border-indigo-650'
                            : 'bg-white dark:bg-[#151f32] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-850 hover:bg-slate-50'
                        }`}
                      >
                        Con Diferencias ({sessionItems.filter(it => it.is_checked === 1 && it.counted_stock !== it.system_stock).length})
                      </button>
                    </div>

                    {/* Ocultar ya revisados toggle */}
                    <label className="flex items-center gap-2 text-[10.5px] font-black uppercase text-slate-500 dark:text-slate-400 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={hideRevisados}
                        onChange={e => setHideRevisados(e.target.checked)}
                        className="rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                      />
                      <span>Ocultar revisados</span>
                    </label>
                  </div>

                  {/* SECCIÓN 4: LISTA DE PRODUCTOS (Rediseñada - Tarjetas mobile-first independientes) */}
                  <div className="flex-1 overflow-y-auto min-h-[30vh] flex flex-col gap-3 pr-1 scrollbar-thin">
                    {filteredItems.length === 0 ? (
                      <div className="p-12 text-center text-slate-400 dark:text-slate-500 font-bold text-xs uppercase tracking-wide bg-white dark:bg-[#101726]/20 border border-slate-200 dark:border-slate-800 rounded-2xl select-none">
                        Ningún producto coincide con el filtro o búsqueda actual.
                      </div>
                    ) : (
                      filteredItems.map((it, idx) => {
                        const isChecked = it.is_checked === 1;
                        const diffVal = it.counted_stock - it.system_stock;
                        const badge = getStatusDisplay(it.status, diffVal, isChecked);
                        const hasMovement = it.had_movements_during_count === 1;
                        const isMovExpanded = !!expandedMovements[it.product_id];
                        const movements = movementsByProduct[it.product_id] || [];
                        const movementsLoading = !!loadingMovements[it.product_id];

                        return (
                          <div 
                            key={it.id}
                            id={`product-card-${it.id}`}
                            className={`bg-white dark:bg-[#11192e] rounded-2xl border p-4 md:p-5 flex flex-col gap-3.5 transition-all duration-250 select-none ${
                              isChecked 
                                ? 'border-emerald-500/40 bg-emerald-500/[0.02] dark:bg-emerald-500/[0.01]' 
                                : 'border-slate-200 dark:border-slate-850 hover:border-slate-300 dark:hover:border-slate-800 shadow-sm'
                            }`}
                          >
                            {/* Card Top Header: Number and Status Badge */}
                            <div className="flex justify-between items-center gap-2 select-none">
                              <span className="text-[10px] font-mono text-slate-450 dark:text-slate-400 uppercase tracking-widest font-black">
                                Producto {idx + 1} de {filteredItems.length}
                              </span>
                              <span className={`px-2.5 py-1 text-[9px] font-black uppercase rounded-lg border leading-none ${badge.bg}`}>
                                {badge.label}
                              </span>
                            </div>

                            {/* Product Info */}
                            <div className="flex flex-col">
                              <h4 className="font-extrabold text-sm md:text-base text-slate-850 dark:text-white uppercase leading-tight tracking-tight break-words">
                                {it.product_name}
                              </h4>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-1 font-semibold text-[10.5px]">
                                <p className="text-slate-400 font-mono">
                                  SKU: <span className="text-slate-700 dark:text-slate-200 font-bold">{it.product_sku || 'Sin SKU'}</span>
                                </p>
                                <span className="bg-slate-100 dark:bg-[#192239] px-2 py-0.5 rounded-md text-slate-500 dark:text-slate-400 uppercase text-[9px] font-black">
                                  {it.product_category}
                                </span>
                              </div>

                              {/* ALERTA DE MOVIMIENTO DURANTE CONTEO (Inline) */}
                              {hasMovement && (
                                <div className="mt-3 flex flex-col gap-2 bg-amber-500/5 border border-amber-500/15 p-3 rounded-xl select-none">
                                  <div className="flex items-center gap-2 text-[10px] font-black text-amber-600 dark:text-amber-400">
                                    <AlertTriangle size={13} className="shrink-0 animate-bounce" />
                                    <span>Se registraron ventas o devoluciones durante esta auditoría.</span>
                                  </div>
                                  <p className="text-[9.5px] text-slate-500 dark:text-slate-400 leading-normal font-medium pl-5">
                                    Revisa físicamente el artículo para confirmar que el stock concuerde.
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => toggleMovements(it)}
                                    className="self-start ml-5 px-3 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-white text-[9px] font-extrabold uppercase rounded-lg transition"
                                  >
                                    {isMovExpanded ? 'Ocultar movimientos' : 'Ver movimientos de este artículo'}
                                  </button>

                                  {/* Movements Expanded inline */}
                                  {isMovExpanded && (
                                    <div className="mt-2 ml-5 p-2 bg-white dark:bg-black/20 border border-slate-200/60 dark:border-slate-800 rounded-lg text-[10px]">
                                      {movementsLoading ? (
                                        <div className="py-2 text-center text-slate-400 font-bold">Cargando...</div>
                                      ) : movements.length === 0 ? (
                                        <div className="py-2 text-center text-slate-400 font-bold">Sin movimientos recientes.</div>
                                      ) : (
                                        <div className="overflow-x-auto">
                                          <table className="w-full text-left">
                                            <thead>
                                              <tr className="border-b border-slate-100 dark:border-slate-800 text-[8px] uppercase tracking-wider text-slate-400 font-black">
                                                <th className="pb-1">Tipo</th>
                                                <th className="pb-1">Cantidad</th>
                                                <th className="pb-1">Referencia</th>
                                                <th className="pb-1">Usuario</th>
                                                <th className="pb-1">Fecha</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50 dark:divide-slate-850/50 text-[9.5px] font-bold text-slate-700 dark:text-slate-300">
                                              {movements.map((m: any, mIdx: number) => (
                                                <tr key={mIdx}>
                                                  <td className="py-1 uppercase text-indigo-650 dark:text-indigo-400">{m.type || m.tipo || 'Movimiento'}</td>
                                                  <td className="py-1 font-mono">{m.quantity || m.cantidad} u</td>
                                                  <td className="py-1 font-mono text-slate-450">{m.reference || m.sale_id || '-'}</td>
                                                  <td className="py-1 uppercase text-slate-500">{m.username || 'Sistema'}</td>
                                                  <td className="py-1 text-slate-450 font-mono text-[8.5px]">{new Date(m.created_at || m.timestamp).toLocaleString()}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Quantities Display columns */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/70 dark:bg-black/25 p-3.5 rounded-xl border border-slate-200/50 dark:border-slate-850 text-center select-none">
                              <div className="flex flex-col sm:border-r border-slate-200/50 dark:border-slate-850">
                                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Cantidad Esperada</span>
                                <span className="font-mono text-sm font-extrabold text-slate-700 dark:text-slate-200 block mt-1">
                                  {it.system_stock} unidades
                                </span>
                              </div>
                              <div className="flex flex-col sm:border-r border-slate-200/50 dark:border-slate-850">
                                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Cantidad Física</span>
                                <span className="font-mono text-sm font-extrabold text-slate-750 dark:text-slate-105 block mt-1">
                                  {isChecked ? `${it.counted_stock} unidades` : 'Pendiente de contar'}
                                </span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">Diferencia</span>
                                <span className={`font-mono text-sm font-black block mt-1 ${
                                  !isChecked 
                                    ? 'text-slate-400' 
                                    : diffVal === 0 ? 'text-emerald-500' : diffVal > 0 ? 'text-indigo-500' : 'text-rose-500'
                                }`}>
                                  {!isChecked ? '-' : diffVal > 0 ? `+${diffVal} unidades` : `${diffVal} unidades`}
                                </span>
                              </div>
                            </div>

                            {/* Quantity Input Field & Incrementor */}
                            <div className="flex items-center justify-between gap-4 select-none">
                              <label className="text-[10.5px] font-black uppercase text-slate-500 dark:text-slate-400">Existencia Física:</label>
                              <div className="flex items-center gap-1.5 max-w-[200px] flex-1">
                                <button
                                  type="button"
                                  disabled={activeSession.status === 'completado'}
                                  onClick={() => handleUpdateItem(it.id, { counted_stock: Math.max(0, it.counted_stock - 1) })}
                                  className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-[#1a233a] border border-slate-200 dark:border-slate-800 text-slate-655 dark:text-slate-300 flex items-center justify-center font-extrabold text-lg hover:bg-slate-200 active:scale-95 transition shrink-0 select-none cursor-pointer disabled:opacity-50"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  disabled={activeSession.status === 'completado'}
                                  value={it.counted_stock === null || it.counted_stock === undefined ? '' : it.counted_stock}
                                  onFocus={e => e.target.select()}
                                  onChange={e => {
                                    const parsed = parseInt(e.target.value);
                                    if (!isNaN(parsed) && parsed >= 0) {
                                      handleUpdateItem(it.id, { counted_stock: parsed });
                                    } else if (e.target.value === '') {
                                      handleUpdateItem(it.id, { counted_stock: 0 });
                                    }
                                  }}
                                  className="w-full text-center font-mono font-black py-2 rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-indigo-500 text-slate-850 dark:text-white bg-white dark:bg-[#11192e] text-base h-12 select-text"
                                />
                                <button
                                  type="button"
                                  disabled={activeSession.status === 'completado'}
                                  onClick={() => handleUpdateItem(it.id, { counted_stock: it.counted_stock + 1 })}
                                  className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-[#1a233a] border border-slate-200 dark:border-slate-800 text-slate-655 dark:text-slate-300 flex items-center justify-center font-extrabold text-lg hover:bg-slate-200 active:scale-95 transition shrink-0 select-none cursor-pointer disabled:opacity-50"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            {/* Notes Section (Compact) */}
                            <div className="flex flex-col gap-1.5 select-none">
                              <label className="text-[9.5px] font-black uppercase tracking-wider text-slate-400 pl-0.5">Observación / Nota sobre este artículo:</label>
                              <input
                                type="text"
                                placeholder="Ej. empaque dañado, producto vencido, extraviado en exhibidor..."
                                value={it.notes || ''}
                                disabled={activeSession.status === 'completado'}
                                onChange={e => handleUpdateItem(it.id, { notes: e.target.value })}
                                className="text-xs p-3 border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#11192e] rounded-xl text-slate-800 dark:text-white focus:outline-none focus:border-indigo-500 w-full"
                              />
                            </div>

                            {/* Special Audit Status Selector */}
                            <div className="flex flex-col gap-1.5 mt-1 select-none">
                              <label className="text-[9.5px] font-black uppercase tracking-wider text-slate-400 pl-0.5">Clasificación de Auditoría Especial:</label>
                              <div className="grid grid-cols-3 gap-2">
                                <button
                                  type="button"
                                  disabled={activeSession.status === 'completado'}
                                  onClick={() => handleUpdateItem(it.id, { status: 'correcto', is_checked: 1 })}
                                  className={`py-2 px-1 text-[10px] font-bold rounded-xl uppercase border transition-all cursor-pointer ${
                                    it.status === 'correcto' 
                                      ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30 font-black' 
                                      : 'bg-transparent text-slate-450 border-slate-200 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-900'
                                  }`}
                                >
                                  Correcto
                                </button>
                                <button
                                  type="button"
                                  disabled={activeSession.status === 'completado'}
                                  onClick={() => {
                                    if (confirm("¿Está seguro de marcar este producto como 'No encontrado'? Se registrará existencia de 0 unidades.")) {
                                      handleUpdateItem(it.id, { status: 'no_encontrado', counted_stock: 0, is_checked: 1 });
                                    }
                                  }}
                                  className={`py-2 px-1 text-[10px] font-bold rounded-xl uppercase border transition-all cursor-pointer ${
                                    it.status === 'no_encontrado' 
                                      ? 'bg-amber-500/10 text-amber-600 border-amber-500/30 font-black' 
                                      : 'bg-transparent text-slate-450 border-slate-200 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-900'
                                  }`}
                                >
                                  Perdido
                                </button>
                                <button
                                  type="button"
                                  disabled={activeSession.status === 'completado'}
                                  onClick={() => handleUpdateItem(it.id, { status: 'requiere_revision', is_checked: 1 })}
                                  className={`py-2 px-1 text-[10px] font-bold rounded-xl uppercase border transition-all cursor-pointer ${
                                    it.status === 'requiere_revision' 
                                      ? 'bg-purple-500/10 text-purple-600 border-purple-500/30 font-black' 
                                      : 'bg-transparent text-slate-450 border-slate-200 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-900'
                                  }`}
                                >
                                  Revisar
                                </button>
                              </div>
                            </div>

                            {/* Mark Checked Button (Tactile 44px+ Height, clean design) */}
                            <div className="mt-2 select-none">
                              <button
                                type="button"
                                disabled={activeSession.status === 'completado'}
                                onClick={() => handleToggleCheck(it)}
                                className={`w-full h-12 rounded-xl text-xs uppercase font-black tracking-widest transition-all active:scale-[0.99] cursor-pointer flex items-center justify-center gap-2 ${
                                  isChecked 
                                    ? 'bg-slate-100 dark:bg-slate-850 text-slate-450 hover:bg-slate-200 hover:text-slate-650' 
                                    : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-md shadow-emerald-500/10'
                                }`}
                              >
                                {isChecked ? (
                                  <>
                                    <Check size={16} />
                                    <span>Revisado ✓ (Clic para deshacer)</span>
                                  </>
                                ) : (
                                  <span>Marcar como revisado</span>
                                )}
                              </button>
                            </div>

                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* SECCIÓN 5: ACCIONES FINALES (Separada, fuera de la lista de productos) */}
                  <div className="border-t border-slate-200 dark:border-slate-850 pt-4 shrink-0 flex flex-col gap-3 select-none bg-slate-50 dark:bg-[#0c111e]">
                    
                    {/* Habilitación o advertencia de pendientes */}
                    {activeSummary.pendingItems > 0 ? (
                      <div className="flex items-center gap-2 p-3 bg-rose-500/5 text-rose-600 dark:text-rose-400 border border-rose-500/15 rounded-xl text-[11px] font-black uppercase">
                        <AlertTriangle size={15} />
                        <span>Todavía tienes {activeSummary.pendingItems} productos pendientes de verificar.</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 p-3 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 border border-emerald-500/15 rounded-xl text-[11px] font-black uppercase">
                        <CheckCircle size={15} />
                        <span>¡Todos los productos han sido auditados correctamente! Listo para enviar.</span>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={handleCancelSession}
                        className="py-3 px-4 bg-transparent border border-slate-200 dark:border-slate-850 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-550 hover:text-slate-700 dark:hover:text-slate-350 font-black text-xs uppercase rounded-xl transition cursor-pointer flex-1"
                      >
                        Cancelar auditoría
                      </button>
                      <button
                        onClick={onClose}
                        className="py-3 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-855 dark:hover:bg-slate-800 text-slate-650 dark:text-slate-200 font-black text-xs uppercase rounded-xl transition cursor-pointer flex-1"
                      >
                        Guardar y continuar después
                      </button>
                      <button
                        onClick={handleCompleteSession}
                        disabled={activeSummary.pendingItems > 0 || isLoading}
                        className={`py-3 px-6 font-black text-xs uppercase rounded-xl transition shadow-lg flex-1 cursor-pointer flex items-center justify-center gap-2 ${
                          activeSummary.pendingItems > 0 
                            ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-550 shadow-none cursor-not-allowed' 
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-650/10'
                        }`}
                      >
                        <Check size={14} />
                        <span>Concluir conteo y enviar</span>
                      </button>
                    </div>
                  </div>

                </div>
              )}

            </div>
          )}

          {activeTab === 'historico' && (
            <div className="flex-1 flex flex-col gap-4 min-h-0 select-none">
              
              <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0">
                
                {/* Listado de Auditorías Completadas en el Pasado */}
                <div className="flex-1 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-2xl min-h-[30vh]">
                  
                  {/* MOBILE ADAPTATION: Card List instead of wide table */}
                  <div className="block lg:hidden flex flex-col gap-2.5 p-1">
                    {historicalCounts.length === 0 ? (
                      <div className="p-12 text-center text-slate-400 font-bold text-xs uppercase tracking-wider">
                        No se registran auditorías históricas finalizadas.
                      </div>
                    ) : (
                      historicalCounts.map(h => {
                        const isApp = h.status === 'aprobado' || h.status === 'cerrado';
                        const isSelected = selectedHistoricCount?.id === h.id;
                        return (
                          <div
                            key={h.id}
                            className={`p-3.5 bg-white dark:bg-[#11192e] rounded-xl border flex flex-col gap-2 transition ${
                              isSelected 
                                ? 'border-indigo-500 bg-indigo-500/[0.01]' 
                                : 'border-slate-200 dark:border-slate-850 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex justify-between items-center text-xs">
                              <span className="font-mono text-slate-400 font-black">#AUDIT-{h.id}</span>
                              <span className={`py-0.5 px-2 border rounded-full text-[8px] uppercase font-black ${
                                isApp 
                                  ? 'bg-emerald-500/5 text-emerald-600 border-emerald-500/10' 
                                  : 'bg-indigo-500/5 text-indigo-650 border-indigo-550/10'
                              }`}>
                                {h.status === 'cerrado' ? 'Conciliado' : h.status}
                              </span>
                            </div>
                            <div className="text-xs">
                              <p className="text-slate-800 dark:text-slate-200 font-bold">Por: @{h.username.toUpperCase()}</p>
                              <p className="text-slate-400 text-[10px] font-medium mt-0.5">Cierre: {new Date(h.created_at).toLocaleString()}</p>
                              {h.category_filter && (
                                <p className="text-slate-500 text-[10px] font-semibold mt-1">Filtro: {h.category_filter}</p>
                              )}
                            </div>
                            <button
                              onClick={() => handleViewHistoricCount(h)}
                              className="w-full mt-2 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 dark:bg-slate-850 dark:hover:bg-slate-800 dark:border-slate-700 text-indigo-655 dark:text-indigo-400 text-[10px] font-black uppercase rounded-lg transition"
                            >
                              Ver detalles y diferencias
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* DESKTOP VIEW: Clean Table */}
                  <div className="hidden lg:block">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-100/50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-slate-800 text-[9px] font-black text-slate-450 uppercase tracking-widest pl-4">
                          <th className="p-3 pl-5">ID Auditoría</th>
                          <th className="p-3">Realizado Por</th>
                          <th className="p-3 text-center">Filtro de Alcance</th>
                          <th className="p-3 text-center">Estado</th>
                          <th className="p-3 text-center">Conciliado Por</th>
                          <th className="p-3 text-center">Fecha de Cierre</th>
                          <th className="p-3 text-center pr-5">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-150 dark:divide-slate-850 text-[11px] font-bold">
                        {historicalCounts.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-12 text-center text-slate-400 font-semibold uppercase tracking-wide">
                              No se registran auditorías o controles físicos históricos en este negocio.
                            </td>
                          </tr>
                        ) : (
                          historicalCounts.map(h => {
                            const isApp = h.status === 'aprobado' || h.status === 'cerrado';
                            const isSelected = selectedHistoricCount?.id === h.id;
                            return (
                              <tr 
                                key={h.id} 
                                className={`hover:bg-slate-100/30 dark:hover:bg-[#0d1221]/30 transition ${
                                  isSelected ? 'bg-indigo-500/5' : ''
                                }`}
                              >
                                <td className="p-3 pl-5 font-mono text-slate-450">#AUDIT-{h.id}</td>
                                <td className="p-3 uppercase text-slate-700 dark:text-slate-200">@{h.username}</td>
                                <td className="p-3 text-center">
                                  <span className="bg-slate-100 dark:bg-black/30 border border-slate-200 dark:border-slate-800 py-0.5 px-2 text-[9px] rounded-lg">
                                    {h.category_filter || 'Todos los productos'}
                                  </span>
                                </td>
                                <td className="p-3 text-center">
                                  <span className={`py-0.5 px-2 border rounded-full text-[8.5px] uppercase font-black ${
                                    isApp 
                                      ? 'bg-emerald-500/5 text-emerald-600 border-emerald-500/10' 
                                      : 'bg-indigo-500/5 text-indigo-650 border-indigo-550/10'
                                  }`}>
                                    {h.status === 'cerrado' ? 'Conciliado' : h.status}
                                  </span>
                                </td>
                                <td className="p-3 text-center text-slate-450 font-semibold uppercase">{h.approved_by_username || '-'}</td>
                                <td className="p-3 text-center font-mono text-slate-500 text-[10px]">{new Date(h.created_at).toLocaleString()}</td>
                                <td className="p-3 text-center pr-5">
                                  <button
                                    onClick={() => handleViewHistoricCount(h)}
                                    className="py-1 px-3 bg-slate-50 border border-slate-200 dark:bg-[#11192e] dark:border-slate-800 hover:bg-slate-100 text-indigo-655 dark:text-indigo-400 text-[10px] font-black uppercase rounded-lg transition"
                                  >
                                    Ver Detalle
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                </div>

                {/* Vista del Detalle de Diferencias de la auditoría seleccionada */}
                {selectedHistoricCount && (
                  <div className="w-full md:w-96 shrink-0 flex flex-col gap-3 min-h-[300px]">
                    <div className="bg-white dark:bg-[#11192e] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-4 h-full">
                      <div className="flex justify-between items-center border-b border-slate-150 dark:border-slate-850 pb-2.5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                          <span>Discrepancias Auditoría #{selectedHistoricCount.id}</span>
                        </span>
                        <button 
                          onClick={() => setSelectedHistoricCount(null)}
                          className="text-slate-400 hover:text-slate-650 dark:hover:text-white p-1 rounded-lg"
                        >
                          <X size={15} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-center text-xs pb-3 border-b border-slate-150 dark:border-slate-850">
                        <div className="p-2.5 bg-slate-50 dark:bg-black/25 rounded-xl border border-slate-150/60 dark:border-slate-850">
                          <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Calculados</div>
                          <div className="font-mono font-black text-xs text-slate-650 dark:text-white mt-1">{historicSummary.totalSystemStock} pz</div>
                        </div>
                        <div className="p-2.5 bg-slate-50 dark:bg-black/25 rounded-xl border border-slate-150/60 dark:border-slate-850">
                          <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Contados</div>
                          <div className="font-mono font-black text-xs text-slate-650 dark:text-white mt-1">{historicSummary.totalCountedStock} pz</div>
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto max-h-[40vh] flex flex-col gap-2.5 pr-1 scrollbar-thin">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider pl-1 block">Diferencias de producto individuales:</span>
                        
                        {historicItems.filter(it => it.counted_stock !== it.system_stock).map(it => {
                          const diff = it.counted_stock - it.system_stock;
                          return (
                            <div key={it.id} className="p-3 rounded-xl border border-slate-150 dark:border-slate-850 bg-slate-50/40 dark:bg-[#070c14]/30 flex justify-between items-center">
                              <div className="max-w-[70%]">
                                <div className="text-xs font-extrabold text-slate-800 dark:text-slate-200 uppercase truncate leading-none">{it.product_name}</div>
                                <div className="text-[9px] text-slate-450 dark:text-slate-400 font-mono mt-1.5 font-bold">
                                  Esp: {it.system_stock} | Real: {it.counted_stock}
                                </div>
                                {it.notes && (
                                  <p className="text-[9px] italic text-slate-500 mt-1">Obs: "{it.notes}"</p>
                                )}
                              </div>
                              <span className={`font-mono text-xs font-black shrink-0 ${diff > 0 ? 'text-indigo-500' : 'text-rose-500'}`}>
                                {diff > 0 ? `+${diff}` : diff} unidades
                              </span>
                            </div>
                          );
                        })}

                        {historicItems.filter(it => it.counted_stock !== it.system_stock).length === 0 && (
                          <div className="text-center p-10 text-slate-450 text-[10px] font-black uppercase leading-normal">
                            ✓ ¡Inventario perfecto! El conteo físico coincidió al 100% con el sistema de ventas.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

              </div>

            </div>
          )}

        </div>

        {/* Footer del Modal (Con amplio padding inferior para navegación en celulares) */}
        <div className="p-4 md:p-5 bg-white dark:bg-[#0f1626] border-t border-slate-200 dark:border-slate-800 flex justify-between items-center shrink-0 select-none pb-8 md:pb-5">
          <span className="text-[10px] text-slate-400 font-bold hidden sm:inline uppercase">
            {activeTab === 'activo' ? 'Conteo Activo' : 'Historial de Registros'}
          </span>
          <button 
            type="button"
            onClick={onClose} 
            className="px-5 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-700 dark:text-white font-extrabold text-xs uppercase rounded-xl cursor-pointer transition select-none flex items-center justify-center min-h-[44px]"
          >
            Cerrar Panel
          </button>
        </div>

      </div>
    </div>
  );
}
