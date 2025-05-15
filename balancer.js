// Используем глобальные объекты вместо импортов
const PIXI = window.PIXI;
const gsap = window.gsap;

class MemoryProfiler {
    constructor() {
        this.measurements = [];
        this.startTime = performance.now();
        this.lastMeasurement = 0;
        this.interval = 1000; // измеряем каждую секунду
    }

    measure() {
        const now = performance.now();
        if (now - this.lastMeasurement < this.interval) return;

        this.lastMeasurement = now;
        if (performance.memory) {
            const measurement = {
                time: now - this.startTime,
                usedJSHeapSize: performance.memory.usedJSHeapSize,
                totalJSHeapSize: performance.memory.totalJSHeapSize,
                jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
            };
            this.measurements.push(measurement);
        }
    }

    getReport() {
        if (this.measurements.length < 2) return 'Недостаточно данных';
        
        const first = this.measurements[0];
        const last = this.measurements[this.measurements.length - 1];
        const growth = last.usedJSHeapSize - first.usedJSHeapSize;
        const growthRate = growth / (last.time - first.time);
        
        return {
            initialSize: Math.round(first.usedJSHeapSize / 1024 / 1024) + 'MB',
            finalSize: Math.round(last.usedJSHeapSize / 1024 / 1024) + 'MB',
            growth: Math.round(growth / 1024 / 1024) + 'MB',
            growthRate: Math.round(growthRate / 1024) + 'KB/s',
            duration: Math.round((last.time - first.time) / 1000) + 's'
        };
    }
}

class BuoyancySimulation {
    constructor() {
        this.profiler = new MemoryProfiler();
        this.showMemoryReport = false; // Отключаем отчет о памяти
        this.isDemoMode = false; // Отключаем демо-режим
        
        this.app = new PIXI.Application({
            width: window.innerWidth,
            height: window.innerHeight,
            backgroundColor: 0x222222,
            antialias: true,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true
        });
        document.body.appendChild(this.app.view);

        // Добавляем обработчик изменения размера окна
        this.handleResize = () => {
            this.app.renderer.resize(window.innerWidth, window.innerHeight);
            this.updateCentersPositions();
        };
        window.addEventListener('resize', this.handleResize);

        // Добавляем обработчик двойного щелчка на уровне DOM
        this.app.view.addEventListener('dblclick', (e) => {
            const rect = this.app.view.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const pos = { x, y };
            
            let clickedNode = null;
            
            // Проверяем все центры
            for (const center of this.centers) {
                if (this.isPointInNode(pos, center.sprite)) {
                    clickedNode = center;
                    break;
                }
                
                // Проверяем узлы центра
                for (const node of center.nodes) {
                    if (this.isPointInNode(pos, node.sprite)) {
                        clickedNode = node;
                        break;
                    }
                }
                
                if (clickedNode) break;
            }
            
            if (clickedNode) {
                this.startTextEditing(clickedNode);
            }
        });

        // Параметры симуляции
        this.gravity = 0.5;
        this.baseBuoyancy = 0.5;
        this.centerRadius = 50;
        this.nodeRadius = 45;
        this.linkLength = 170;
        this.minNodeWidth = 60;
        this.maxNodeWidth = 220;
        this.minNodeHeight = 40;
        this.maxNodeHeight = 120;
        this.padding = 14;
        this.textGap = 4;
        this.isDragging = false;
        this.draggedNode = null;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.nodeAngles = new Map();
        this.nodeDistances = new Map();
        this.nodeCenters = new Map();
        
        // Инициализируем два центра
        this.centers = [
            {
                x: this.app.screen.width / 3,
                y: this.app.screen.height / 2,
                coef: 0,
                vx: 0,
                vy: 0,
                label: 'Делать',
                nodes: []
            },
            {
                x: this.app.screen.width * 2/3,
                y: this.app.screen.height / 2,
                coef: 0,
                vx: 0,
                vy: 0,
                label: 'Не делать',
                nodes: []
            }
        ];

        // Контейнеры для графики
        this.mainContainer = new PIXI.Container();
        this.linksContainer = new PIXI.Container();
        this.nodesContainer = new PIXI.Container();
        this.centersContainer = new PIXI.Container();
        
        this.mainContainer.addChild(this.linksContainer);
        this.mainContainer.addChild(this.nodesContainer);
        this.mainContainer.addChild(this.centersContainer);
        
        this.app.stage.addChild(this.mainContainer);
        
        // Создаем пул объектов
        this.nodePool = [];
        this.linkPool = [];
        this.textPool = new Map();
        
        this.selectedNode = null;
        this.setupScene();
        this.setupAnimation();
        this.setupInteraction();
        
        // Добавляем кнопки управления
        this.createAddCenterButton();
        
        window.addEventListener('beforeunload', () => this.destroy());

        this.textStyle = new PIXI.TextStyle({
            fill: '#fff',
            fontSize: 18,
            fontWeight: 'bold',
            align: 'center',
            wordWrap: true,
            wordWrapWidth: this.maxNodeWidth - this.padding * 2
        });
    }

    // ... [Остальной код класса остается без изменений] ...
}

// Запускаем симуляцию после загрузки страницы
window.addEventListener('load', () => {
    new BuoyancySimulation();
}); 
