import { createGrid, GridApi, GridOptions, themeQuartz, ICellEditorComp, ICellEditorParams } from "ag-grid-community";
import { merge } from "lodash";
import { App, Plugin } from "obsidian";
import { RendererConfig, RendererContext } from "./rendererRegistry";
import { parse } from 'json5';
import { EventRef } from "obsidian";
import { Settings } from "../../settings/Settings";
import { ViewDefinition } from "../parser";
import { ModernCellParser } from "../../syntaxHighlight/cellParser/ModernCellParser";

class AutocompleteCellEditor implements ICellEditorComp {
    private eInput: HTMLInputElement;
    private eDatalist: HTMLDataListElement;
    private container: HTMLDivElement;

    init(params: ICellEditorParams & { values?: string[] }) {
        this.container = document.createElement('div');
        this.container.style.width = '100%';
        this.container.style.height = '100%';
        this.container.style.display = 'flex';
        this.container.style.alignItems = 'center';

        this.eInput = document.createElement('input');
        this.eInput.value = params.value ?? '';
        this.eInput.style.width = '100%';
        this.eInput.style.height = '100%';
        this.eInput.style.border = 'none';
        this.eInput.style.outline = 'none';
        this.eInput.style.background = 'transparent';
        this.eInput.style.color = 'inherit';
        this.eInput.style.fontSize = 'inherit';
        this.eInput.style.fontFamily = 'inherit';
        this.eInput.style.padding = '0 8px';

        const datalistId = 'dl-' + Math.random().toString(36).substring(2, 9);
        this.eInput.setAttribute('list', datalistId);

        this.eDatalist = document.createElement('datalist');
        this.eDatalist.id = datalistId;

        const values = params.values || [];
        values.forEach((val: string) => {
            const option = document.createElement('option');
            option.value = val;
            this.eDatalist.appendChild(option);
        });

        this.container.appendChild(this.eInput);
        this.container.appendChild(this.eDatalist);
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

    destroy() {}
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

export class GridRendererCommunicator {
    constructor(
        private el: HTMLElement,
        private config: Partial<GridOptions>,
        private plugin: Plugin | null,
        private settings: Settings,
        private app: App,
        private cellParser?: ModernCellParser
    ) {
        this.initialize()
        this.setupLayoutObservers()
    }

    private _gridApi: GridApi<any>
    private errorEl: HTMLElement
    private errorOverlay: HTMLElement
    private resizeObserver: ResizeObserver
    private unregisterLeafChange: EventRef | null = null

    get gridApi(): GridApi<any> {
        return this._gridApi
    }

    private setupLayoutObservers() {
        // Debounce the resize observer to prevent too frequent updates
        let resizeTimeout: any;
        this.resizeObserver = new ResizeObserver(() => {
            if (this._gridApi) {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
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
                cellRendererSelector: this.cellParser ? () => {
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
            pagination: true,
            suppressMovableColumns: true,
            loadThemeGoogleFonts: false,
            rowData: [],
            columnDefs: [],
            domLayout: 'autoHeight', // This can be overridden by config
            enableCellTextSelection: true,
            paginationPageSize: this.settings.get('gridItemsPerPage') ?? 10
            // ensureDomOrder: true
        }, this.config)
        this._gridApi = createGrid(
            grid,
            gridOptions,
        );
    }

     setData(columns: any[], data: any[], isEditable: boolean = false) {
        if (!this.gridApi) {
            throw new Error('Grid has not been initiated')
        }
        if (columns && columns.length) {
            const visibleColumns = columns.filter(c => c !== '__rowid' && c !== 'rowid' && !c.startsWith('__rowid_'));
            
            const autocompleteSetting = this.settings.get('autocompleteColumns' as any) || '';
            const autocompleteCols = autocompleteSetting.split(',').map((s: string) => s.trim().toLowerCase()).filter(Boolean);

            this.gridApi.setGridOption('columnDefs', visibleColumns.map(field => {
                const isAutocomplete = autocompleteCols.includes(field.toLowerCase());
                const colDef: any = { 
                    field,
                    editable: isEditable
                };
                if (isAutocomplete) {
                    colDef.cellClass = 'sqlseal-wikilink-cell';
                    if (isEditable) {
                        colDef.cellEditor = AutocompleteCellEditor;
                        const uniqueValues = Array.from(new Set(data.map(row => row[field]).filter(val => val !== undefined && val !== null && val !== '')));
                        colDef.cellEditorParams = {
                            values: uniqueValues
                        };
                    }
                }
                return colDef;
            }))
        }
        this.gridApi.setGridOption('enableCellTextSelection', !isEditable)
        this.gridApi.setGridOption('rowData', data)
        this.gridApi.setGridOption('loading', false)
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


    render(config: Partial<GridOptions>, el: HTMLElement, { cellParser }: RendererContext) {
        const communicator = new GridRendererCommunicator(el, config, this.plugin, this.settings, this.app, cellParser)
        return {
            render: (data: DataParam) => {
                communicator.setData(data.columns ?? [], data.data, data.isEditable ?? false)
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