import { createGrid, GridApi, GridOptions, themeQuartz, ICellEditorComp, ICellEditorParams } from "ag-grid-community";
import { merge } from "lodash";
import { App, Plugin } from "obsidian";
import { RendererConfig, RendererContext } from "./rendererRegistry";
import { parse } from 'json5';
import { EventRef } from "obsidian";
import { Settings } from "../../settings/Settings";
import { ViewDefinition } from "../parser";
import { ModernCellParser } from "../../syntaxHighlight/cellParser/ModernCellParser";
import { formatHeaderName, parseAutocompleteSettings, resolveHeaderName } from "../../../utils/views";
import { GenericTextSuggest } from "../../../utils/suggesters";

class AutocompleteCellEditor implements ICellEditorComp {
    private eInput: HTMLInputElement;
    private container: HTMLDivElement;
    private suggester: GenericTextSuggest | null = null;

    init(params: ICellEditorParams & { values?: string[] }) {
        this.container.setCssStyles({
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center'
        });

        this.eInput = document.createElement('input');
        this.eInput.value = params.value ?? '';
        this.eInput.setCssStyles({
            width: '100%',
            height: '100%',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: 'inherit',
            fontSize: 'inherit',
            fontFamily: 'inherit',
            padding: '0 8px'
        });

        this.container.appendChild(this.eInput);

        const globalApp = (window as any).app;
        if (globalApp) {
            this.suggester = new GenericTextSuggest(globalApp, this.eInput, params.values || []);
        }
    }

    getGui() {
        return this.container;
    }

    afterGuiAttached() {
        this.eInput.focus();
        this.eInput.select();
    }

    getValue() {
        return this.eInput.value;
    }

    isPopup() {
        return false;
    }

    destroy() {
        this.suggester = null;
    }
}

interface DataParam {
    data: Record<string, unknown>[],
    columns?: string[],
    isEditable?: boolean
}

const getCurrentTheme = () => {
    return document.body.classList.contains('theme-dark') ? 'dark' : 'light';
}

const getAgGridTheme = (theme: 'dark' | 'light') => {
    return {
        backgroundColor: "var(--color-primary)", //"#1f2836",
        browserColorScheme: theme,
        chromeBackgroundColor: {
            ref: "foregroundColor",
            mix: 0.07,
            onto: "backgroundColor"
        },
        foregroundColor: "var(--text-normal)",
        headerFontSize: 14
    } as const
}

function parseNumericValue(val: any): number | null {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    const str = String(val).trim();
    const numericRegex = /^\s*[$€£¥]?[+-]?(?:\d+(?:,\d{3})*(?:\.\d+)?|\.\d+)\s*%?$/;
    if (!numericRegex.test(str)) return null;

    const cleanStr = str.replace(/[^0-9.-]/g, '');
    const num = parseFloat(cleanStr);
    return isNaN(num) ? null : num;
}

function parseDateValue(val: any): Date | null {
    if (val === null || val === undefined) return null;
    if (val instanceof Date) return val;
    const timestamp = Date.parse(String(val));
    return isNaN(timestamp) ? null : new Date(timestamp);
}

function detectColumnType(values: any[]): 'numeric' | 'date' | 'string' {
    let numericCount = 0;
    let dateCount = 0;
    let nonEmptyCount = 0;

    for (const val of values) {
        if (val === null || val === undefined || String(val).trim() === '') continue;
        nonEmptyCount++;
        
        let isDate = false;
        if (isNaN(Number(val))) {
            const dateVal = parseDateValue(val);
            if (dateVal !== null) {
                dateCount++;
                isDate = true;
            }
        }
        
        if (!isDate) {
            const numericVal = parseNumericValue(val);
            if (numericVal !== null) {
                numericCount++;
            }
        }
    }

    if (nonEmptyCount === 0) return 'string';
    if (dateCount / nonEmptyCount > 0.5) return 'date';
    if (numericCount / nonEmptyCount > 0.5) return 'numeric';
    return 'string';
}

function calculateAggregation(values: any[], type: string, colType: 'numeric' | 'date' | 'string'): any {
    const nonEmpty = values.filter(v => v !== null && v !== undefined && String(v).trim() !== '');
    if (nonEmpty.length === 0) return '';

    if (type === 'count') {
        return nonEmpty.length;
    }

    if (colType === 'numeric') {
        const nums = nonEmpty.map(v => parseNumericValue(v)).filter((v): v is number => v !== null);
        if (nums.length === 0) return '';

        switch (type) {
            case 'sum':
                return nums.reduce((a, b) => a + b, 0);
            case 'average':
                return nums.reduce((a, b) => a + b, 0) / nums.length;
            case 'min':
                return Math.min(...nums);
            case 'max':
                return Math.max(...nums);
            case 'mid': {
                const sorted = [...nums].sort((a, b) => a - b);
                const mid = Math.floor(sorted.length / 2);
                return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
            }
            default:
                return '';
        }
    } else if (colType === 'date') {
        const dates = nonEmpty.map(v => parseDateValue(v)).filter((v): v is Date => v !== null);
        if (dates.length === 0) return '';

        switch (type) {
            case 'min': {
                const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
                return minDate.toISOString().split('T')[0];
            }
            case 'max': {
                const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
                return maxDate.toISOString().split('T')[0];
            }
            default:
                return '';
        }
    } else {
        switch (type) {
            case 'min':
                return [...nonEmpty].sort()[0];
            case 'max':
                return [...nonEmpty].sort().reverse()[0];
            default:
                return '';
        }
    }
}

function formatAggregatedValue(val: any): string {
    if (val === null || val === undefined) return '';
    if (typeof val === 'number') {
        if (Number.isNaN(val)) return '';
        if (Number.isInteger(val)) return String(val);
        return val.toFixed(2);
    }
    return String(val);
}

export class GridRendererCommunicator {
    constructor(
        private el: HTMLElement,
        private config: Partial<GridOptions>,
        private plugin: Plugin | null,
        private settings: Settings,
        private app: App,
        private cellParser?: ModernCellParser,
        private sourcePath?: string
    ) {
        this.initialize()
        this.setupLayoutObservers()
    }

    private _gridApi: GridApi<any>
    private errorEl: HTMLElement
    private errorOverlay: HTMLElement
    private resizeObserver: ResizeObserver
    private unregisterLeafChange: EventRef | null = null
    private rowCountEl: HTMLSpanElement;
    private topBar: HTMLDivElement;
    private prevPageBtn: HTMLButtonElement;
    private nextPageBtn: HTMLButtonElement;
    private pageInfoEl: HTMLSpanElement;

    private visibleColumnIds: string[] = [];
    private gridData: any[] = [];
    private pinnedRowData: any[] = [];
    private selectionStartCell: { rowIndex: number, colId: string, isPinned: boolean } | null = null;
    private selectionEndCell: { rowIndex: number, colId: string, isPinned: boolean } | null = null;
    private isDraggingSelection: boolean = false;
    private onMouseMoveRef: (event: MouseEvent) => void;
    private onMouseUpRef: () => void;
    private onCopyRef: (event: ClipboardEvent) => void;

    get gridApi(): GridApi<any> {
        return this._gridApi
    }

    private setupLayoutObservers() {
        // Debounce the resize observer to prevent too frequent updates
        let resizeTimeout: any;
        this.resizeObserver = new ResizeObserver(() => {
            if (this._gridApi) {
                window.clearTimeout(resizeTimeout);
                resizeTimeout = window.setTimeout(() => {
                    if (!this._gridApi.isDestroyed()) {
                        this._gridApi.autoSizeAllColumns();
                    }
                }, 100);
            }
        });
        this.resizeObserver.observe(this.el);

        this.unregisterLeafChange = this.app.workspace.on('active-leaf-change', (leaf) => {
            if (this._gridApi && leaf?.view?.getViewType() !== 'canvas' && !this._gridApi.isDestroyed()) {
                this._gridApi.autoSizeAllColumns();
            }
        });
    }

    cleanup() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect()
        }
        if (this.unregisterLeafChange) {
            this.app.workspace.offref(this.unregisterLeafChange)
        }
        if (this.onMouseMoveRef) {
            document.removeEventListener('mousemove', this.onMouseMoveRef);
        }
        if (this.onMouseUpRef) {
            document.removeEventListener('mouseup', this.onMouseUpRef);
        }
        if (this.onCopyRef) {
            document.removeEventListener('copy', this.onCopyRef);
        }
    }

    private showError(message: string) {
        this.gridApi.setGridOption('loading', false)
        this.errorEl.textContent = message //.replace(`TTT${prefix}_`, '');
        this.errorOverlay.classList.remove('hidden')
    }

    private hideError() {
        this.errorOverlay.classList.add('hidden')
    }

    initialize() {
        this.el.empty()
        const div = this.el.createDiv()
        div.classList.add('sqlseal-grid-wrapper')

        // Add header bar at the top
        this.topBar = div.createDiv({ cls: 'sqlseal-grid-header-bar' })

        // Left container (row count)
        const leftContainer = this.topBar.createDiv({ cls: 'sqlseal-grid-top-left' })
        this.rowCountEl = leftContainer.createSpan({ cls: 'sqlseal-grid-row-count' })
        this.rowCountEl.textContent = '0 rows'

        // Center container (pagination)
        const paginationDiv = this.topBar.createDiv({ cls: 'sqlseal-grid-pagination' })
        this.prevPageBtn = paginationDiv.createEl('button', { cls: 'sqlseal-page-btn', text: '◀' })
        this.pageInfoEl = paginationDiv.createEl('span', { cls: 'sqlseal-page-info', text: 'Page 1 of 1' })
        this.nextPageBtn = paginationDiv.createEl('button', { cls: 'sqlseal-page-btn', text: '▶' })

        this.prevPageBtn.addEventListener('click', () => {
            if (this._gridApi && !this._gridApi.isDestroyed()) {
                this._gridApi.paginationGoToPreviousPage();
            }
        });
        this.nextPageBtn.addEventListener('click', () => {
            if (this._gridApi && !this._gridApi.isDestroyed()) {
                this._gridApi.paginationGoToNextPage();
            }
        });

        // Right container (calculations dropdown)
        const rightContainer = this.topBar.createDiv({ cls: 'sqlseal-grid-top-right' })
        rightContainer.createDiv({ cls: 'sqlseal-grid-calculations-menu' })

        const grid = div.createDiv()
        const errorMessageOverlay = div.createDiv({ cls: ['sqlseal-grid-error-message-overlay', 'hidden'] })
        this.errorEl = errorMessageOverlay.createDiv({ cls: ['sqlseal-grid-error-message'] })
        this.errorOverlay = errorMessageOverlay
        grid.classList.add('ag-theme-quartz')

        const myTheme = themeQuartz
            .withParams(getAgGridTheme(getCurrentTheme()))


        const gridOptions: GridOptions = merge({
            theme: myTheme,
            defaultColDef: {
                resizable: false,
                editable: this.settings.get("enableEditing"),
                cellRendererSelector: this.cellParser ? (params: any) => {
                    if (params.node && params.node.rowPinned === 'top') {
                        return undefined;
                    }
                    return {
                        component: ({ value }: { value: string }) => this.cellParser!.render(value)
                    }
                } : undefined,
                autoHeight: true
            },
            autoSizeStrategy: {
                // make sure to fit content
                type: 'fitGridWidth',
                // defaultMinWidth: 150,
            },
            getRowHeight: (params: any) => {
                if (params.node && params.node.rowPinned === 'top') {
                    return 24;
                }
                return undefined;
            },
            rowSelection: 'multiple',
            pagination: true,
            suppressMovableColumns: true,
            loadThemeGoogleFonts: false,
            rowData: [],
            columnDefs: [],
            domLayout: 'autoHeight', // This can be overridden by config
            enableCellTextSelection: true,
            paginationPageSize: this.settings.get('gridItemsPerPage') ?? 10,
            onPaginationChanged: () => {
                this.updatePaginationControls();
            }
            // ensureDomOrder: true
        }, this.config)

        grid.setAttribute('tabindex', '-1');
        grid.setCssStyles({ outline: 'none' });

        this._gridApi = createGrid(
            grid,
            gridOptions,
        );

        this.setupCellSelectionDrag(grid);
    }

    private setupCellSelectionDrag(grid: HTMLElement) {
        const getCellInfo = (target: HTMLElement | null) => {
            const cellEl = target?.closest('.ag-cell');
            if (!cellEl) return null;
            const rowEl = cellEl.closest('.ag-row');
            if (!rowEl) return null;
            
            const isPinned = rowEl.closest('.ag-floating-top') !== null;
            const rowIndexAttr = rowEl.getAttribute('row-index');
            let rowIndex = rowIndexAttr ? parseInt(rowIndexAttr) : -1;
            if (isNaN(rowIndex) || rowIndex === -1) {
                const parent = rowEl.parentElement;
                if (parent) {
                    const siblings = Array.from(parent.querySelectorAll('.ag-row'));
                    rowIndex = siblings.indexOf(rowEl);
                }
            }
            if (rowIndex === -1) return null;

            const colId = cellEl.getAttribute('col-id');
            if (!colId) return null;

            return { rowIndex, colId, isPinned };
        };

        grid.addEventListener('mousedown', (event: MouseEvent) => {
            if (event.button !== 0) return; // left click only
            const cellInfo = getCellInfo(event.target as HTMLElement);
            if (!cellInfo) {
                this.selectionStartCell = null;
                this.selectionEndCell = null;
                this.updateCellSelectionStyles();
                return;
            }

            this.isDraggingSelection = true;
            grid.classList.add('sqlseal-dragging');
            this.selectionStartCell = cellInfo;
            this.selectionEndCell = cellInfo;
            this.updateCellSelectionStyles();
            
            grid.focus();
            event.preventDefault();
        }, true); // Use capture phase to intercept before ag-Grid halts propagation

        this.onMouseMoveRef = (event: MouseEvent) => {
            if (!this.isDraggingSelection || !this.selectionStartCell) return;
            const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
            const cellInfo = getCellInfo(target);
            if (!cellInfo) return;

            if (
                cellInfo.rowIndex !== this.selectionEndCell?.rowIndex ||
                cellInfo.colId !== this.selectionEndCell?.colId ||
                cellInfo.isPinned !== this.selectionEndCell?.isPinned
            ) {
                this.selectionEndCell = cellInfo;
                this.updateCellSelectionStyles();
            }
        };

        this.onMouseUpRef = () => {
            if (this.isDraggingSelection) {
                this.isDraggingSelection = false;
                grid.classList.remove('sqlseal-dragging');
            }
        };

        this.onCopyRef = (event: ClipboardEvent) => {
            if (!this.selectionStartCell || !this.selectionEndCell) return;
            const activeEl = document.activeElement;
            if (!activeEl || !this.el.contains(activeEl)) return;

            event.preventDefault();
            this.copySelectedCells(event);
        };

        document.addEventListener('mousemove', this.onMouseMoveRef);
        document.addEventListener('mouseup', this.onMouseUpRef);
        document.addEventListener('copy', this.onCopyRef);
    }

    private updateCellSelectionStyles() {
        if (!this.selectionStartCell || !this.selectionEndCell || this.visibleColumnIds.length === 0) {
            this.el.querySelectorAll('.sqlseal-cell-selected').forEach(cell => {
                cell.classList.remove(
                    'sqlseal-cell-selected',
                    'sqlseal-cell-selected-top',
                    'sqlseal-cell-selected-bottom',
                    'sqlseal-cell-selected-left',
                    'sqlseal-cell-selected-right'
                );
            });
            return;
        }

        const P = this.pinnedRowData.length;
        const startRow = this.selectionStartCell.isPinned 
            ? this.selectionStartCell.rowIndex - P 
            : this.selectionStartCell.rowIndex;
        const endRow = this.selectionEndCell.isPinned 
            ? this.selectionEndCell.rowIndex - P 
            : this.selectionEndCell.rowIndex;
        const startColId = this.selectionStartCell.colId;
        const endColId = this.selectionEndCell.colId;

        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);

        const startColIdx = this.visibleColumnIds.indexOf(startColId);
        const endColIdx = this.visibleColumnIds.indexOf(endColId);
        if (startColIdx === -1 || endColIdx === -1) return;

        const minColIdx = Math.min(startColIdx, endColIdx);
        const maxColIdx = Math.max(startColIdx, endColIdx);

        const cells = this.el.querySelectorAll('.ag-cell');
        cells.forEach(cell => {
            const rowEl = cell.closest('.ag-row');
            if (!rowEl) return;
            const rowIndexAttr = rowEl.getAttribute('row-index');
            let rIdx = rowIndexAttr ? parseInt(rowIndexAttr) : -1;
            if (isNaN(rIdx) || rIdx === -1) {
                const parent = rowEl.parentElement;
                if (parent) {
                    const siblings = Array.from(parent.querySelectorAll('.ag-row'));
                    rIdx = siblings.indexOf(rowEl);
                }
            }
            if (rIdx === -1) return;
            const cId = cell.getAttribute('col-id');
            if (!cId) return;

            const cIdx = this.visibleColumnIds.indexOf(cId);
            if (cIdx === -1) return;

            const isPinned = rowEl.closest('.ag-floating-top') !== null;
            const virtualRow = isPinned ? rIdx - P : rIdx;
            
            const inRange = (virtualRow >= minRow && virtualRow <= maxRow && cIdx >= minColIdx && cIdx <= maxColIdx);

            if (inRange) {
                cell.classList.add('sqlseal-cell-selected');
                if (virtualRow === minRow) cell.classList.add('sqlseal-cell-selected-top');
                else cell.classList.remove('sqlseal-cell-selected-top');

                if (virtualRow === maxRow) cell.classList.add('sqlseal-cell-selected-bottom');
                else cell.classList.remove('sqlseal-cell-selected-bottom');

                if (cIdx === minColIdx) cell.classList.add('sqlseal-cell-selected-left');
                else cell.classList.remove('sqlseal-cell-selected-left');

                if (cIdx === maxColIdx) cell.classList.add('sqlseal-cell-selected-right');
                else cell.classList.remove('sqlseal-cell-selected-right');
            } else {
                cell.classList.remove(
                    'sqlseal-cell-selected',
                    'sqlseal-cell-selected-top',
                    'sqlseal-cell-selected-bottom',
                    'sqlseal-cell-selected-left',
                    'sqlseal-cell-selected-right'
                );
            }
        });
    }

    private copySelectedCells(event: ClipboardEvent) {
        if (!this.selectionStartCell || !this.selectionEndCell || this.visibleColumnIds.length === 0) return;

        const P = this.pinnedRowData.length;
        const startRow = this.selectionStartCell.isPinned 
            ? this.selectionStartCell.rowIndex - P 
            : this.selectionStartCell.rowIndex;
        const endRow = this.selectionEndCell.isPinned 
            ? this.selectionEndCell.rowIndex - P 
            : this.selectionEndCell.rowIndex;
        const startColId = this.selectionStartCell.colId;
        const endColId = this.selectionEndCell.colId;

        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);

        const startColIdx = this.visibleColumnIds.indexOf(startColId);
        const endColIdx = this.visibleColumnIds.indexOf(endColId);
        if (startColIdx === -1 || endColIdx === -1) return;

        const minColIdx = Math.min(startColIdx, endColIdx);
        const maxColIdx = Math.max(startColIdx, endColIdx);

        let copyText = '';
        for (let vr = minRow; vr <= maxRow; vr++) {
            let rowData: any = null;
            if (vr < 0) {
                rowData = this.pinnedRowData[vr + P];
            } else {
                const rowNode = this.gridApi.getDisplayedRowAtIndex(vr);
                rowData = rowNode ? rowNode.data : null;
            }

            if (!rowData) continue;

            const rowCells = [];
            for (let c = minColIdx; c <= maxColIdx; c++) {
                const colId = this.visibleColumnIds[c];
                const val = rowData[colId] ?? '';
                rowCells.push(val);
            }
            copyText += rowCells.join('\t');
            if (vr < maxRow) {
                copyText += '\n';
            }
        }

        event.clipboardData?.setData('text/plain', copyText);
    }

    private updatePaginationControls() {
        if (!this._gridApi || this._gridApi.isDestroyed()) return;
        const currentPage = this._gridApi.paginationGetCurrentPage() + 1;
        const totalPages = this._gridApi.paginationGetTotalPages();
        if (this.pageInfoEl) {
            this.pageInfoEl.textContent = `Page ${currentPage} of ${totalPages || 1}`;
        }
        if (this.prevPageBtn) {
            this.prevPageBtn.disabled = currentPage <= 1;
        }
        if (this.nextPageBtn) {
            this.nextPageBtn.disabled = currentPage >= totalPages;
        }
    }

    private renderCalculationsMenu(columns: any[], data: any[], isEditable: boolean, queryText?: string) {
        const menuContainer = this.topBar.querySelector('.sqlseal-grid-calculations-menu') as HTMLElement;
        if (!menuContainer) return;
        menuContainer.empty();

        if (!queryText) return;

        const cacheKey = `${this.sourcePath ?? ''}::${queryText.trim()}`;
        const views = this.settings.get('codeblockViews' as any) || {};
        const blockConfig = views[cacheKey] || {};

        let activeCalcs: string[] = blockConfig.activeCalcs;
        if (!activeCalcs) {
            const defaults = new Set<string>();
            columns.forEach(field => {
                if (field === '__rowid' || field === 'rowid' || field.startsWith('__rowid_')) return;
                const vals = data.map(row => row[field]);
                const type = detectColumnType(vals);
                if (type === 'numeric') defaults.add('sum');
            });
            if (defaults.size === 0) defaults.add('count');
            activeCalcs = Array.from(defaults);
        }

        const details = menuContainer.createEl('details', { cls: 'sqlseal-calc-dropdown' });
        const summary = details.createEl('summary', { cls: 'sqlseal-calc-summary', text: 'Calculations' });
        const optionsDiv = details.createDiv({ cls: 'sqlseal-calc-options' });

        const calcTypes = [
            { value: 'sum', label: 'Sum' },
            { value: 'average', label: 'Average' },
            { value: 'mid', label: 'Median' },
            { value: 'min', label: 'Min' },
            { value: 'max', label: 'Max' },
            { value: 'count', label: 'Count' }
        ];

        const sortedCalcTypes = [...calcTypes].sort((a, b) => {
            const aChecked = activeCalcs.includes(a.value);
            const bChecked = activeCalcs.includes(b.value);
            if (aChecked && !bChecked) return -1;
            if (!aChecked && bChecked) return 1;
            return calcTypes.indexOf(a) - calcTypes.indexOf(b);
        });

        sortedCalcTypes.forEach(calc => {
            const label = optionsDiv.createEl('label', { cls: 'sqlseal-calc-label' });
            const checkbox = label.createEl('input', { type: 'checkbox', value: calc.value });
            checkbox.checked = activeCalcs.includes(calc.value);
            label.createSpan({ text: ' ' + calc.label });

            checkbox.addEventListener('change', () => {
                let updatedCalcs = [...activeCalcs];
                if (checkbox.checked) {
                    if (!updatedCalcs.includes(calc.value)) {
                        updatedCalcs.push(calc.value);
                    }
                } else {
                    updatedCalcs = updatedCalcs.filter(v => v !== calc.value);
                }

                const updatedViews = { ...(this.settings.get('codeblockViews' as any) || {}) };
                updatedViews[cacheKey] = {
                    ...(updatedViews[cacheKey] || {}),
                    activeCalcs: updatedCalcs
                };
                this.settings.set('codeblockViews' as any, updatedViews);

                this.setData(columns, data, isEditable, queryText);
            });
        });
    }

     setData(columns: any[], data: any[], isEditable: boolean = false, queryText?: string) {
        if (!this.gridApi) {
            throw new Error('Grid has not been initiated')
        }

        this.selectionStartCell = null;
        this.selectionEndCell = null;
        this.updateCellSelectionStyles();

        if (this.rowCountEl) {
            this.rowCountEl.textContent = `${data.length} rows`
        }

        const showFooter = !!queryText;
        const cacheKey = `${this.sourcePath ?? ''}::${(queryText ?? '').trim()}`;
        const views = this.settings.get('codeblockViews' as any) || {};
        const currentBlockConfig = views[cacheKey] || {};

        if (showFooter) {
            this.topBar.setCssStyles({ display: '' });
            this.renderCalculationsMenu(columns, data, isEditable, queryText);
        } else {
            this.topBar.setCssStyles({ display: 'none' });
        }

        let activeCalcs: string[] = currentBlockConfig.activeCalcs;
        if (showFooter && !activeCalcs) {
            const defaults = new Set<string>();
            columns.forEach(field => {
                if (field === '__rowid' || field === 'rowid' || field.startsWith('__rowid_')) return;
                const vals = data.map(row => row[field]);
                const type = detectColumnType(vals);
                if (type === 'numeric') defaults.add('sum');
            });
            if (defaults.size === 0) defaults.add('count');
            activeCalcs = Array.from(defaults);
        }

        const calcOrder = ['sum', 'average', 'mid', 'min', 'max', 'count'];
        if (activeCalcs) {
            activeCalcs = [...activeCalcs].sort((a, b) => calcOrder.indexOf(a) - calcOrder.indexOf(b));
        }



        if (columns && columns.length) {
            const visibleColumns = columns.filter(c => c !== '__rowid' && c !== 'rowid' && !c.startsWith('__rowid_'));
            this.visibleColumnIds = visibleColumns;
            this.gridData = data;
            
            const autocompleteSetting = this.settings.get('autocompleteColumns' as any) || '';
            const { columns: autocompleteCols } = parseAutocompleteSettings(autocompleteSetting);

            this.gridApi.setGridOption('columnDefs', visibleColumns.map(field => {
                const isFirstCol = (field === visibleColumns[0]);
                const isAutocomplete = autocompleteCols.includes(field.toLowerCase());
                
                const colDef: any = { 
                    field,
                    headerName: resolveHeaderName(field, autocompleteSetting),
                    editable: (params: any) => {
                        if (params.node && params.node.rowPinned === 'top') {
                            return false;
                        }
                        return isEditable;
                    }
                };

                const cellClasses: string[] = [];
                if (isFirstCol) {
                    cellClasses.push('sqlseal-first-col-cell');
                }
                if (isAutocomplete) {
                    cellClasses.push('sqlseal-wikilink-cell');
                }
                if (cellClasses.length > 0) {
                    colDef.cellClass = cellClasses.join(' ');
                }

                if (isAutocomplete && isEditable) {
                    colDef.cellEditor = AutocompleteCellEditor;
                    const uniqueValues = Array.from(new Set(data.map(row => row[field]).filter(val => val !== undefined && val !== null && val !== '')));
                    colDef.cellEditorParams = {
                        values: uniqueValues
                    };
                }

                if (showFooter) {
                    colDef.cellRenderer = (params: any) => {
                        if (params.node.rowPinned === 'top') {
                            const value = params.value ?? '';

                            const eGui = document.createElement('div');
                            eGui.className = 'sqlseal-footer-cell';

                            if (value) {
                                const valSpan = document.createElement('span');
                                valSpan.className = 'sqlseal-footer-value';
                                valSpan.textContent = value;
                                eGui.appendChild(valSpan);
                            }

                            return eGui;
                        } else {
                            if (this.cellParser) {
                                return this.cellParser.render(params.value);
                            }
                            return params.value;
                        }
                    };
                }

                return colDef;
            }))
        }
        this.gridApi.setGridOption('enableCellTextSelection', !isEditable)
        this.gridApi.setGridOption('rowData', data)

        if (showFooter && columns && columns.length && activeCalcs && activeCalcs.length) {
            const visibleColumns = columns.filter(c => c !== '__rowid' && c !== 'rowid' && !c.startsWith('__rowid_'));
            
            const pinnedRows = activeCalcs.map(calcType => {
                const row: Record<string, any> = { __calcType: calcType };
                visibleColumns.forEach(field => {
                    const columnValues = data.map(row => row[field]);
                    const colType = detectColumnType(columnValues);
                    
                    let isApplicable = false;
                    if (calcType === 'count') {
                        isApplicable = true;
                    } else if (colType === 'numeric' && ['sum', 'average', 'mid', 'min', 'max'].includes(calcType)) {
                        isApplicable = true;
                    } else if (colType === 'date' && ['min', 'max'].includes(calcType)) {
                        isApplicable = true;
                    }

                    if (isApplicable) {
                        const aggValue = calculateAggregation(columnValues, calcType, colType);
                        row[field] = formatAggregatedValue(aggValue);
                    } else {
                        row[field] = '';
                    }
                });
                return row;
            });

            this.pinnedRowData = pinnedRows;
            this.gridApi.setGridOption('pinnedTopRowData', pinnedRows);
            this.renderFloatingLabels(activeCalcs);
        } else {
            this.pinnedRowData = [];
            this.gridApi.setGridOption('pinnedTopRowData', []);
            this.renderFloatingLabels([]);
        }

        this.gridApi.setGridOption('loading', false)
        this.updatePaginationControls();
    }

    private renderFloatingLabels(activeCalcs: string[]) {
        const gridEl = this.el.querySelector('.ag-theme-quartz') as HTMLElement;
        if (!gridEl) return;

        gridEl.querySelector('.sqlseal-floating-labels-container')?.remove();

        if (activeCalcs.length === 0) return;

        const container = document.createElement('div');
        container.className = 'sqlseal-floating-labels-container';

        const labelMap: Record<string, string> = {
            sum: 'Sum',
            average: 'Avg',
            count: 'Count',
            mid: 'Med',
            min: 'Min',
            max: 'Max'
        };

        activeCalcs.forEach(calcType => {
            const item = document.createElement('div');
            item.className = 'sqlseal-floating-label-item';

            const labelSpan = document.createElement('span');
            labelSpan.className = 'sqlseal-footer-label';
            labelSpan.textContent = labelMap[calcType] || calcType;
            
            item.appendChild(labelSpan);
            container.appendChild(item);
        });

        gridEl.appendChild(container);
    }

    showInfo(type: 'loading' | 'error', message: string) {
        switch (type) {
            case 'loading':
                this.hideError()
                this.gridApi.setGridOption('loading', true)
                break;
            case 'error':
                this.showError(message)
                break
        }
    }
}

export class GridRenderer implements RendererConfig {
    constructor(private settings: Settings, private readonly plugin: Plugin | null, private readonly app: App) { }
    get viewDefinition(): ViewDefinition {
        return {
            name: this.rendererKey,
            argument: 'anyObject?',
            singleLine: false
        }
    }
    get rendererKey() {
        return 'grid'
    }

    isInitialised = false

    validateConfig(config: string) {
        if (!config || !config.trim()) {
            return {}
        }
        return parse(config)
    }


    render(config: Partial<GridOptions>, el: HTMLElement, { cellParser, sourcePath }: RendererContext) {
        const communicator = new GridRendererCommunicator(el, config, this.plugin, this.settings, this.app, cellParser, sourcePath)
        return {
            render: (data: DataParam & { queryText?: string }) => {
                communicator.setData(data.columns ?? [], data.data, data.isEditable ?? false, data.queryText)
                communicator.gridApi.autoSizeAllColumns()
            },
            error: (message: string) => {
                communicator.showInfo('error', message)
            },
            cleanup: () => {
                communicator.cleanup()
                communicator.gridApi.destroy()
            },
            communicator
        }
    }
}