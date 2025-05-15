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
        const memory = performance.memory;
        if (memory) {
            const measurement = {
                time: now - this.startTime,
                usedJSHeapSize: memory.usedJSHeapSize,
                totalJSHeapSize: memory.totalJSHeapSize,
                jsHeapSizeLimit: memory.jsHeapSizeLimit
            };
            this.measurements.push(measurement);
            console.log('Memory usage:', {
                used: Math.round(measurement.usedJSHeapSize / 1024 / 1024) + 'MB',
                total: Math.round(measurement.totalJSHeapSize / 1024 / 1024) + 'MB',
                limit: Math.round(measurement.jsHeapSizeLimit / 1024 / 1024) + 'MB'
            });
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
        this.showMemoryReport = false; // Флаг для отключения кнопки отчета о памяти
        this.isDemoMode = false; // Флаг для демо-режима
        
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
            console.log('Double click detected');
            const rect = this.app.view.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const pos = { x, y };
            
            let clickedNode = null;
            
            // Проверяем все центры
            for (const center of this.centers) {
                if (this.isPointInNode(pos, center.sprite)) {
                    console.log('Center node clicked');
                    clickedNode = center;
                    break;
                }
                
                // Проверяем узлы центра
                for (const node of center.nodes) {
                    if (this.isPointInNode(pos, node.sprite)) {
                        console.log('Node clicked:', node.label);
                        clickedNode = node;
                        break;
                    }
                }
                
                if (clickedNode) break;
            }
            
            if (clickedNode) {
                console.log('Starting text editing for:', clickedNode.label);
                this.startTextEditing(clickedNode);
            }
        });

        // Параметры симуляции
        this.gravity = 0.5;
        this.baseBuoyancy = 0.5;
        this.centerRadius = 50;
        this.nodeRadius = 45;
        this.linkLength = 170;
        this.minNodeWidth = 60; // Минимальная ширина узла
        this.maxNodeWidth = 220; // Максимальная ширина узла
        this.minNodeHeight = 40; // Минимальная высота узла
        this.maxNodeHeight = 120; // Максимальная высота узла
        this.padding = 14; // Отступ от текста до края узла
        this.textGap = 4; // Отступ между меткой и коэффициентом
        this.isDragging = false;
        this.draggedNode = null;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.nodeAngles = new Map(); // Хранит углы для каждого узла
        this.nodeDistances = new Map(); // Хранит расстояния от центра для каждого узла
        this.nodeCenters = new Map(); // Хранит связь узла с его центром
        
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
        
        // Добавляем кнопку для вывода отчета о памяти
        this.createMemoryReportButton();
        
        // Добавляем кнопку для создания нового центра
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

    getFromPool(pool, createFn) {
        let obj = pool.find(item => !item.inUse);
        if (!obj) {
            obj = createFn();
            pool.push(obj);
        }
        obj.inUse = true;
        return obj;
    }

    returnToPool(obj) {
        obj.inUse = false;
        obj.visible = false;
    }

    setupScene() {
        // Создаем центры
        for (let centerIndex = 0; centerIndex < this.centers.length; centerIndex++) {
            const center = this.centers[centerIndex];
            
            // Создаем узлы только в демо-режиме
            if (this.isDemoMode) {
                const nodeCount = 4; // Количество узлов для каждого центра
                const angleStep = (2 * Math.PI) / nodeCount;
                
                for (let i = 0; i < nodeCount; i++) {
                    const angle = i * angleStep;
                    const node = {
                        label: `Аргумент ${center.coef >= 0 ? 'За' : 'Против'}`,
                        coef: Math.floor(Math.random() * 5) - 2,
                        x: center.x + Math.cos(angle) * this.linkLength,
                        y: center.y + Math.sin(angle) * this.linkLength,
                        vx: 0,
                        vy: 0,
                        zIndex: 10 + i // Добавляем начальный z-index
                    };
                    
                    this.nodeAngles.set(node, angle);
                    this.nodeDistances.set(node, this.linkLength);
                    this.nodeCenters.set(node, center);
                    center.nodes.push(node);
                    
                    const link = this.createLink();
                    const nodeSprite = this.createNode(this.getColor(node.coef, true), node.label, node.coef, true);
                    
                    nodeSprite.x = node.x;
                    nodeSprite.y = node.y;
                    
                    this.linksContainer.addChild(link);
                    this.nodesContainer.addChild(nodeSprite);
                    
                    node.link = link;
                    node.sprite = nodeSprite;
                }
            }
            
            // Добавляем центры последними, чтобы они были поверх линий
            const centerNode = this.createNode(this.getColor(center.coef, true), center.label, center.coef, true);
            centerNode.x = center.x;
            centerNode.y = center.y;
            center.zIndex = 100; // Устанавливаем z-index для центров
            this.centersContainer.addChild(centerNode);
            center.sprite = centerNode;
        }
    }

    createText(content, width) {
        // Создаём текст с нужной шириной переноса
        return new PIXI.Text(content, new PIXI.TextStyle({
            fill: '#fff',
            fontSize: 18,
            fontWeight: 'bold',
            align: 'center',
            wordWrap: true,
            wordWrapWidth: Math.max(width - this.padding * 2, 30)
        }));
    }

    calculateNodeDimensions(label) {
        // Создаём текст метки с максимальной шириной
        let labelText = this.createText(label, this.maxNodeWidth);
        
        // Вычисляем ширину по тексту
        let width = labelText.width + this.padding * 2;
        width = Math.min(Math.max(width, this.minNodeWidth), this.maxNodeWidth);
        
        // Вычисляем необходимую высоту
        let requiredHeight = labelText.height + this.padding * 2;
        
        // Если высота превышает максимальную, масштабируем текст пропорционально
        if (requiredHeight > this.maxNodeHeight) {
            const scale = (this.maxNodeHeight - this.padding * 2) / labelText.height;
            const newFontSize = Math.floor(18 * scale); // 18 - базовый размер шрифта
            
            // Пересоздаём текст с новым размером шрифта
            labelText.destroy();
            
            labelText = new PIXI.Text(label, new PIXI.TextStyle({
                fill: '#fff',
                fontSize: newFontSize,
                fontWeight: 'bold',
                align: 'center',
                wordWrap: true,
                wordWrapWidth: Math.max(width - this.padding * 2, 30)
            }));
            
            requiredHeight = labelText.height + this.padding * 2;
        }
        
        // Устанавливаем финальную высоту
        let height = Math.min(Math.max(requiredHeight, this.minNodeHeight), this.maxNodeHeight);
        
        return { width, height, labelText };
    }

    layoutNode(node, color, label, coef) {
        // Удаляем старые тексты
        if (node.labelText && node.labelText.parent) node.removeChild(node.labelText);
        if (node.coefText && node.coefText.parent) node.removeChild(node.coefText);
        if (node.labelText) node.labelText.destroy();
        if (node.coefText) node.coefText.destroy();
        // Пересоздаём тексты и размеры
        const { width, height, labelText } = this.calculateNodeDimensions(label);
        // Обновляем графику
        if (!node.graphics) {
            node.graphics = new PIXI.Graphics();
            node.addChildAt(node.graphics, 0);
        }
        node.graphics.clear();
        node.graphics.beginFill(color);
        node.graphics.drawRoundedRect(-width/2, -height/2, width, height, 10);
        node.graphics.endFill();
        // Добавляем новые тексты
        labelText.anchor.set(0.5, 0.5);
        labelText.x = 0;
        labelText.y = 0;
        node.addChild(labelText);
        // Обновляем ссылки и размеры
        node.labelText = labelText;
        node.lastCoef = coef;
        node.lastColor = color;
        node.lastLabel = label;
        node.width = width;
        node.height = height;
    }

    createNode(color, label, coef, isCenter = false) {
        const container = new PIXI.Container();
        this.layoutNode(container, color, label, coef);
        return container;
    }

    createLink() {
        const graphics = new PIXI.Graphics();
        graphics.lineStyle(3, 0xffffff, 0.5);
        return graphics;
    }

    getText(content) {
        // Используем единый стиль для всех текстов
        return new PIXI.Text(content, this.textStyle);
    }

    updateNode(node, color, label, coef) {
        if (node.lastCoef !== coef || node.lastColor !== color || node.lastLabel !== label) {
            this.layoutNode(node, color, label, coef);
            // Обновляем текст в панели управления для центрального узла
            if (node === this.centerNode) {
                const panel = document.querySelector('div[style*="position: absolute"]');
                if (panel) {
                    const title = panel.querySelector('b');
                    if (title) {
                        title.textContent = label;
                    }
                }
            }
            
            // Обновляем индикатор коэффициента, если узел выбран
            if (this.selectedNode && node === this.selectedNode.sprite) {
                const existingCoefIndicator = this.nodesContainer.children.find(child => child.coefIndicator === true);
                if (existingCoefIndicator) {
                    this.nodesContainer.removeChild(existingCoefIndicator);
                }
                const coefIndicator = this.createCoefIndicator(coef);
                coefIndicator.x = this.app.screen.width - 100;
                coefIndicator.y = 50;
                coefIndicator.coefIndicator = true;
                this.nodesContainer.addChild(coefIndicator);
            }
        }
    }

    setupAnimation() {
        let lastUpdate = 0;
        const updateInterval = 1000 / 60;

        this.app.ticker.add((delta) => {
            this.profiler.measure();

            const now = performance.now();
            if (now - lastUpdate < updateInterval) return;
            lastUpdate = now;

            // Обновляем z-index для всех узлов
            if (this.selectedNode) {
                const selectedSprite = this.selectedNode.sprite;
                selectedSprite.zIndex = 1000;
            }
            
            // Обновляем каждый центр и его узлы
            for (const center of this.centers) {
                // Устанавливаем z-index для центра
                center.sprite.zIndex = 100;
                
                // Суммируем коэффициенты узлов этого центра
                let sumCoef = 0;
                for (const node of center.nodes) {
                    sumCoef += node.coef;
                }
                center.coef = sumCoef;

                // Обновляем позицию центра с увеличенным демпфированием
                const targetY = this.app.screen.height / 2 - sumCoef * 18;
                const centerForce = (targetY - center.y) * 0.05; // Уменьшаем силу вертикального движения
                center.vy += centerForce;
                center.vy *= 0.7; // Увеличиваем демпфирование вертикального движения
                center.y += center.vy;
                center.sprite.y = center.y;

                // Применяем отталкивание между центрами с увеличенным демпфированием
                for (const otherCenter of this.centers) {
                    if (center !== otherCenter) {
                        const dx = center.x - otherCenter.x;
                        const dy = center.y - otherCenter.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        const minDistance = this.centerRadius * 2.5; // Увеличиваем минимальное расстояние
                        
                        if (distance < minDistance) {
                            const force = (minDistance - distance) * 0.05; // Уменьшаем силу отталкивания
                            const angle = Math.atan2(dy, dx);
                            center.vx += Math.cos(angle) * force;
                            otherCenter.vx -= Math.cos(angle) * force;
                        }
                    }
                }

                // Демпфируем горизонтальное движение центров
                center.vx *= 0.8;

                // Обновляем узлы этого центра
                for (const node of center.nodes) {
                    const sprite = node.sprite;
                    const link = node.link;
                    const angle = this.nodeAngles.get(node);
                    const distance = this.nodeDistances.get(node);

                    if (!this.isDragging || node !== this.draggedNode) {
                        const idealY = center.y - node.coef * 18;
                        const forceY = (idealY - node.y) * 0.09;
                        node.vy += forceY;
                        node.vy *= 0.85;
                        node.y += node.vy;

                        const idealX = center.x + Math.cos(angle) * distance;
                        const forceX = (idealX - node.x) * 0.09;
                        node.vx += forceX;
                        node.vx *= 0.85;
                        node.x += node.vx;

                        // Применяем отталкивание между центром и его узлами с более мягкой силой
                        const dxToCenter = node.x - center.x;
                        const dyToCenter = node.y - center.y;
                        const distanceToCenter = Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter);
                        const minDistanceToCenter = this.centerRadius + this.nodeRadius;
                        
                        if (distanceToCenter < minDistanceToCenter) {
                            const force = (minDistanceToCenter - distanceToCenter) * 0.08; // Уменьшаем силу отталкивания
                            const angle = Math.atan2(dyToCenter, dxToCenter);
                            node.vx += Math.cos(angle) * force;
                            center.vx -= Math.cos(angle) * force * 0.5; // Уменьшаем влияние на центр
                            node.vy += Math.sin(angle) * force;
                            center.vy -= Math.sin(angle) * force * 0.5; // Уменьшаем влияние на центр
                        }

                        // Применяем отталкивание между узлами
                        for (const otherCenter of this.centers) {
                            for (const otherNode of otherCenter.nodes) {
                                if (node !== otherNode) {
                                    const dx = node.x - otherNode.x;
                                    const dy = node.y - otherNode.y;
                                    const distance = Math.sqrt(dx * dx + dy * dy);
                                    const minDistance = this.nodeRadius * 2;
                                    
                                    if (distance < minDistance) {
                                        const force = (minDistance - distance) * 0.1;
                                        const angle = Math.atan2(dy, dx);
                                        node.vx += Math.cos(angle) * force;
                                        otherNode.vx -= Math.cos(angle) * force;
                                        node.vy += Math.sin(angle) * force;
                                        otherNode.vy -= Math.sin(angle) * force;
                                    }
                                }
                            }
                        }
                    }

                    sprite.x = node.x;
                    sprite.y = node.y;

                    link.clear();
                    link.lineStyle(3, 0xffffff, 0.5);
                    link.moveTo(center.x, center.y);
                    link.lineTo(node.x, node.y);

                    this.updateNode(sprite, this.getColor(node.coef, false), node.label, node.coef);
                }

                // Обновляем внешний вид центра
                this.updateNode(center.sprite, this.getColor(center.coef, true), center.label, center.coef);
            }
        });
    }

    getColor(coef, isCenter = false) {
        if (isCenter) {
            // Цвета для центральных узлов (яркие)
            if (coef > 2) return 0x4cff4c;
            if (coef > 0) return 0x3ca03c;
            if (coef === 0) return 0x4a4a4a; // более светлый серый для центров
            if (coef > -2) return 0xa04c4c;
            return 0xff4c4c;
        } else {
            // Цвета для ответвлений (темные)
            if (coef > 0) {
                // Зеленые оттенки для положительных значений
                if (coef >= 5) return 0x007700;
                if (coef >= 4) return 0x006600;
                if (coef >= 3) return 0x005500;
                if (coef >= 2) return 0x004400;
                return 0x003300;
            } else if (coef < 0) {
                // Красные оттенки для отрицательных значений
                if (coef <= -5) return 0x770000;
                if (coef <= -4) return 0x660000;
                if (coef <= -3) return 0x550000;
                if (coef <= -2) return 0x440000;
                return 0x330000;
            }
            return 0x333333; // нейтральный серый для нуля
        }
    }

    createMemoryReportButton() {
        if (!this.showMemoryReport) return; // Пропускаем создание кнопки, если флаг выключен
        
        const button = document.createElement('button');
        button.textContent = 'Показать отчет о памяти';
        button.style.position = 'absolute';
        button.style.top = '10px';
        button.style.left = '10px';
        button.style.padding = '8px 16px';
        button.style.backgroundColor = '#4CAF50';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '4px';
        button.style.cursor = 'pointer';
        
        button.onclick = () => {
            const report = this.profiler.getReport();
            alert(JSON.stringify(report, null, 2));
        };
        
        document.body.appendChild(button);
    }

    setupInteraction() {
        this.app.stage.eventMode = 'static';
        this.app.stage.hitArea = this.app.screen;
        
        this.app.stage.on('pointerdown', (e) => {
            // Сбрасываем предыдущее выделение при клике на пустое место
            const pos = e.getLocalPosition(this.mainContainer);
            let clickedNode = null;
            
            // Проверяем клик по центральным узлам
            for (const center of this.centers) {
                if (this.isPointInNode(pos, center.sprite)) {
                    clickedNode = center;
                    break;
                }
            }
            
            // Если не кликнули по центру, проверяем остальные узлы
            if (!clickedNode) {
                for (const center of this.centers) {
                    for (const node of center.nodes) {
                        if (this.isPointInNode(pos, node.sprite)) {
                            clickedNode = node;
                            break;
                        }
                    }
                    if (clickedNode) break;
                }
            }
            
            // Проверяем, не кликнули ли мы по кнопке управления
            let currentTarget = e.target;
            while (currentTarget) {
                if (currentTarget.controlButton === true) {
                    return;
                }
                currentTarget = currentTarget.parent;
            }
            
            if (clickedNode && !this.centers.includes(clickedNode)) {
                this.isDragging = true;
                this.draggedNode = clickedNode;
                this.dragStartX = pos.x;
                this.dragStartY = pos.y;
                this.selectedNode = clickedNode;
                this.updateSelection();
            } else if (!clickedNode) {
                if (this.selectedNode) {
                    this.selectedNode = null;
                    this.updateSelection();
                }
            } else if (clickedNode !== this.selectedNode) {
                this.selectedNode = clickedNode;
                this.updateSelection();
            }
        });

        this.app.stage.on('pointermove', (e) => {
            if (this.isDragging && this.draggedNode) {
                const pos = e.getLocalPosition(this.mainContainer);
                const dx = pos.x - this.dragStartX;
                const dy = pos.y - this.dragStartY;
                
                this.draggedNode.x += dx;
                this.draggedNode.y += dy;
                
                const center = this.nodeCenters.get(this.draggedNode);
                const dxToCenter = this.draggedNode.x - center.x;
                const dyToCenter = this.draggedNode.y - center.y;
                const angle = Math.atan2(dyToCenter, dxToCenter);
                const distance = Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter);
                
                this.nodeAngles.set(this.draggedNode, angle);
                this.nodeDistances.set(this.draggedNode, distance);
                
                this.dragStartX = pos.x;
                this.dragStartY = pos.y;
            }
        });

        this.app.stage.on('pointerup', () => {
            if (this.draggedNode) {
                const center = this.nodeCenters.get(this.draggedNode);
                const dxToCenter = this.draggedNode.x - center.x;
                const dyToCenter = this.draggedNode.y - center.y;
                const angle = Math.atan2(dyToCenter, dxToCenter);
                const distance = Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter);
                
                this.nodeAngles.set(this.draggedNode, angle);
                this.nodeDistances.set(this.draggedNode, distance);
            }
            this.isDragging = false;
            this.draggedNode = null;
        });

        this.app.stage.on('pointerupoutside', () => {
            if (this.draggedNode) {
                const center = this.nodeCenters.get(this.draggedNode);
                const dxToCenter = this.draggedNode.x - center.x;
                const dyToCenter = this.draggedNode.y - center.y;
                const angle = Math.atan2(dyToCenter, dxToCenter);
                const distance = Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter);
                
                this.nodeAngles.set(this.draggedNode, angle);
                this.nodeDistances.set(this.draggedNode, distance);
            }
            this.isDragging = false;
            this.draggedNode = null;
        });

        window.addEventListener('keydown', (e) => {
            const activeElement = document.activeElement;
            if (activeElement && activeElement.tagName === 'TEXTAREA') {
                return;
            }
            
            if (e.key === 'Delete' && this.selectedNode && !this.centers.includes(this.selectedNode)) {
                const center = this.nodeCenters.get(this.selectedNode);
                const index = center.nodes.indexOf(this.selectedNode);
                if (index !== -1) {
                    this.nodesContainer.removeChild(this.selectedNode.sprite);
                    this.linksContainer.removeChild(this.selectedNode.link);
                    center.nodes.splice(index, 1);
                    this.selectedNode = null;
                    this.updateSelection();
                }
            }

            // Добавляем обработку стрелок вверх и вниз
            if (this.selectedNode && !this.centers.includes(this.selectedNode)) {
                if (e.key === 'ArrowUp') {
                    // Находим кнопку "За" и анимируем её
                    const plusBtn = this.nodesContainer.children.find(child => 
                        child.controlButton === true && child.children[1].text === 'За'
                    );
                    if (plusBtn) {
                        // Анимация масштаба
                        gsap.to(plusBtn.scale, {
                            x: 0.9,
                            y: 0.9,
                            duration: 0.1,
                            yoyo: true,
                            repeat: 1
                        });
                        // Анимация цвета фона
                        const graphics = plusBtn.children[0];
                        gsap.to(graphics, {
                            tint: 0x333333,
                            duration: 0.1,
                            yoyo: true,
                            repeat: 1,
                            onComplete: () => {
                                graphics.tint = 0xffffff;
                            }
                        });
                    }
                    this.selectedNode.coef = Math.min(5, this.selectedNode.coef + 1);
                    this.updateNode(this.selectedNode.sprite, this.getColor(this.selectedNode.coef, false), this.selectedNode.label, this.selectedNode.coef);
                    this.selectedNode.sprite.graphics.lineStyle(3, 0xffffff, 1);
                    this.selectedNode.sprite.graphics.drawRoundedRect(-this.selectedNode.sprite.width/2, -this.selectedNode.sprite.height/2, this.selectedNode.sprite.width, this.selectedNode.sprite.height, 10);
                    
                    // Обновляем индикатор коэффициента
                    const existingCoefIndicator = this.nodesContainer.children.find(child => child.coefIndicator === true);
                    if (existingCoefIndicator) {
                        this.nodesContainer.removeChild(existingCoefIndicator);
                    }
                    const newCoefIndicator = this.createCoefIndicator(this.selectedNode.coef);
                    newCoefIndicator.x = this.app.screen.width - 100;
                    newCoefIndicator.y = 50;
                    newCoefIndicator.coefIndicator = true;
                    this.nodesContainer.addChild(newCoefIndicator);
                } else if (e.key === 'ArrowDown') {
                    // Находим кнопку "Против" и анимируем её
                    const minusBtn = this.nodesContainer.children.find(child => 
                        child.controlButton === true && child.children[1].text === 'Против'
                    );
                    if (minusBtn) {
                        // Анимация масштаба
                        gsap.to(minusBtn.scale, {
                            x: 0.9,
                            y: 0.9,
                            duration: 0.1,
                            yoyo: true,
                            repeat: 1
                        });
                        // Анимация цвета фона
                        const graphics = minusBtn.children[0];
                        gsap.to(graphics, {
                            tint: 0x333333,
                            duration: 0.1,
                            yoyo: true,
                            repeat: 1,
                            onComplete: () => {
                                graphics.tint = 0xffffff;
                            }
                        });
                    }
                    this.selectedNode.coef = Math.max(-5, this.selectedNode.coef - 1);
                    this.updateNode(this.selectedNode.sprite, this.getColor(this.selectedNode.coef, false), this.selectedNode.label, this.selectedNode.coef);
                    this.selectedNode.sprite.graphics.lineStyle(3, 0xffffff, 1);
                    this.selectedNode.sprite.graphics.drawRoundedRect(-this.selectedNode.sprite.width/2, -this.selectedNode.sprite.height/2, this.selectedNode.sprite.width, this.selectedNode.sprite.height, 10);
                    
                    // Обновляем индикатор коэффициента
                    const existingCoefIndicator = this.nodesContainer.children.find(child => child.coefIndicator === true);
                    if (existingCoefIndicator) {
                        this.nodesContainer.removeChild(existingCoefIndicator);
                    }
                    const newCoefIndicator = this.createCoefIndicator(this.selectedNode.coef);
                    newCoefIndicator.x = this.app.screen.width - 100;
                    newCoefIndicator.y = 50;
                    newCoefIndicator.coefIndicator = true;
                    this.nodesContainer.addChild(newCoefIndicator);
                }
            }
        });
    }

    startTextEditing(node) {
        console.log('Creating textarea for node:', node.label);
        // Создаем HTML элемент для редактирования
        const textarea = document.createElement('textarea');
        textarea.value = node.label;
        
        // Получаем позицию узла в координатах окна
        const nodeSprite = node.sprite;
        const rect = this.app.view.getBoundingClientRect();
        const nodeX = nodeSprite.x + rect.left;
        const nodeY = nodeSprite.y + rect.top;
        
        textarea.style.position = 'fixed';
        textarea.style.left = (nodeX - this.nodeRadius * 2) + 'px';
        textarea.style.top = (nodeY - 70) + 'px';
        textarea.style.width = (this.nodeRadius * 4) + 'px';
        textarea.style.minHeight = '140px';
        textarea.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        textarea.style.color = '#fff';
        textarea.style.border = '1px solid #fff';
        textarea.style.borderRadius = '5px';
        textarea.style.padding = '10px';
        textarea.style.fontSize = '21px';
        textarea.style.fontFamily = 'sans-serif';
        textarea.style.zIndex = '1000';
        textarea.style.resize = 'vertical';
        textarea.style.overflow = 'hidden';
        
        console.log('Adding textarea to document');
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        // Функция для автоматического изменения высоты
        const adjustHeight = () => {
            textarea.style.height = 'auto';
            textarea.style.height = (textarea.scrollHeight) + 'px';
        };

        // Устанавливаем начальную высоту
        adjustHeight();

        // Добавляем обработчик изменения текста
        textarea.addEventListener('input', adjustHeight);

        let isFinishing = false;
        
        const finishEditing = () => {
            if (isFinishing) return;
            isFinishing = true;
            
            const newText = textarea.value.trim();
            if (newText) {
                node.label = newText;
                this.updateNode(node.sprite, this.getColor(node.coef, this.centers.includes(node)), node.label, node.coef);
            }
            textarea.remove();
        };
        
        // Обработка нажатия клавиш
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                finishEditing();
            } else if (e.key === 'Escape') {
                textarea.remove();
            }
        });
        
        // Обработка потери фокуса
        textarea.addEventListener('blur', finishEditing);
    }

    isPointInNode(point, node) {
        const dx = point.x - node.x;
        const dy = point.y - node.y;
        const width = node.width || this.nodeRadius * 2;
        const height = node.height || 70;
        return Math.abs(dx) < width/2 && Math.abs(dy) < height/2;
    }

    updateSelection() {
        // Сначала сбрасываем z-index для всех узлов, сохраняя их относительную позицию
        for (const center of this.centers) {
            // Сортируем узлы по их z-index
            center.nodes.sort((a, b) => b.zIndex - a.zIndex);
            
            // Обновляем z-index спрайтов
            center.sprite.zIndex = center.zIndex;
            // Обновляем внешний вид центра
            this.layoutNode(center.sprite, this.getColor(center.coef, true), center.label, center.coef);
            
            center.nodes.forEach(node => {
                if (node !== this.selectedNode) {
                    node.sprite.zIndex = node.zIndex;
                    // Обновляем внешний вид узла
                    this.layoutNode(node.sprite, this.getColor(node.coef, false), node.label, node.coef);
                }
            });
        }

        // Сортируем контейнеры для применения z-index
        this.nodesContainer.sortChildren();
        this.centersContainer.sortChildren();

        // Удаляем все существующие кнопки управления и индикаторы коэффициентов
        const existingButtons = this.nodesContainer.children.filter(child => 
            child.controlButton === true || child.coefIndicator === true
        );
        for (const button of existingButtons) {
            this.nodesContainer.removeChild(button);
        }
        const existingCenterButtons = this.centersContainer.children.filter(child => 
            child.controlButton === true || child.coefIndicator === true
        );
        for (const button of existingCenterButtons) {
            this.centersContainer.removeChild(button);
        }

        // Сбрасываем массив кнопок для всех узлов
        for (const center of this.centers) {
            center.controlButtons = [];
            for (const node of center.nodes) {
                node.controlButtons = [];
            }
        }

        // Если есть выбранный узел, добавляем ему подсветку, кнопки и индикатор коэффициента
        if (this.selectedNode) {
            const selectedSprite = this.selectedNode.sprite;
            // Сохраняем текущий z-index
            const currentZIndex = this.selectedNode.zIndex;
            // Устанавливаем максимальный z-index
            this.selectedNode.zIndex = 1000;
            selectedSprite.zIndex = 1000;
            
            // Перемещаем выбранный узел в конец массива для правильного отображения
            const container = selectedSprite.parent;
            if (container) {
                container.removeChild(selectedSprite);
                container.addChild(selectedSprite);
            }
            
            // Добавляем подсветку
            selectedSprite.graphics.lineStyle(3, 0xffffff, 1);
            selectedSprite.graphics.drawRoundedRect(-selectedSprite.width/2, -selectedSprite.height/2, selectedSprite.width, selectedSprite.height, 10);
            
            // Добавляем индикатор коэффициента
            const coefIndicator = this.createCoefIndicator(this.selectedNode.coef);
            coefIndicator.x = this.app.screen.width - 100;
            coefIndicator.y = 50;
            coefIndicator.coefIndicator = true;
            this.nodesContainer.addChild(coefIndicator);

            // Добавляем кнопки + и - слева от индикатора коэффициента
            if (!this.centers.includes(this.selectedNode)) {
                const plusBtn = this.createSmallStyledButton('За', this.app.screen.width - 180, 50, () => {
                    this.selectedNode.coef = Math.min(5, this.selectedNode.coef + 1);
                    this.updateNode(this.selectedNode.sprite, this.getColor(this.selectedNode.coef, false), this.selectedNode.label, this.selectedNode.coef);
                    this.selectedNode.sprite.graphics.lineStyle(3, 0xffffff, 1);
                    this.selectedNode.sprite.graphics.drawRoundedRect(-this.selectedNode.sprite.width/2, -this.selectedNode.sprite.height/2, this.selectedNode.sprite.width, this.selectedNode.sprite.height, 10);
                    
                    // Обновляем индикатор коэффициента
                    const existingCoefIndicator = this.nodesContainer.children.find(child => child.coefIndicator === true);
                    if (existingCoefIndicator) {
                        this.nodesContainer.removeChild(existingCoefIndicator);
                    }
                    const newCoefIndicator = this.createCoefIndicator(this.selectedNode.coef);
                    newCoefIndicator.x = this.app.screen.width - 100;
                    newCoefIndicator.y = 50;
                    newCoefIndicator.coefIndicator = true;
                    this.nodesContainer.addChild(newCoefIndicator);
                });

                const minusBtn = this.createSmallStyledButton('Против', this.app.screen.width - 300, 50, () => {
                    this.selectedNode.coef = Math.max(-5, this.selectedNode.coef - 1);
                    this.updateNode(this.selectedNode.sprite, this.getColor(this.selectedNode.coef, false), this.selectedNode.label, this.selectedNode.coef);
                    this.selectedNode.sprite.graphics.lineStyle(3, 0xffffff, 1);
                    this.selectedNode.sprite.graphics.drawRoundedRect(-this.selectedNode.sprite.width/2, -this.selectedNode.sprite.height/2, this.selectedNode.sprite.width, this.selectedNode.sprite.height, 10);
                    
                    // Обновляем индикатор коэффициента
                    const existingCoefIndicator = this.nodesContainer.children.find(child => child.coefIndicator === true);
                    if (existingCoefIndicator) {
                        this.nodesContainer.removeChild(existingCoefIndicator);
                    }
                    const newCoefIndicator = this.createCoefIndicator(this.selectedNode.coef);
                    newCoefIndicator.x = this.app.screen.width - 100;
                    newCoefIndicator.y = 50;
                    newCoefIndicator.coefIndicator = true;
                    this.nodesContainer.addChild(newCoefIndicator);
                });

                this.nodesContainer.addChild(plusBtn, minusBtn);
            }
            
            // Показываем или скрываем кнопку удаления центра
            if (this.deleteCenterButton) {
                this.deleteCenterButton.style.display = this.centers.includes(this.selectedNode) ? 'block' : 'none';
            }
            
            // Добавляем кнопки
            this.addControlButtons(this.selectedNode);
        } else {
            // Скрываем кнопку удаления центра при сбросе выделения
            if (this.deleteCenterButton) {
                this.deleteCenterButton.style.display = 'none';
            }
            // Удаляем индикатор коэффициента при сбросе выделения
            const existingCoefIndicator = this.nodesContainer.children.find(child => child.coefIndicator === true);
            if (existingCoefIndicator) {
                this.nodesContainer.removeChild(existingCoefIndicator);
            }
        }
    }

    createCoefIndicator(coef) {
        const container = new PIXI.Container();
        
        const background = new PIXI.Graphics();
        background.beginFill(0x333333);
        background.drawRoundedRect(-30, -20, 60, 40, 10);
        background.endFill();
        
        const text = this.getText(coef.toString());
        text.anchor.set(0.5);
        
        container.addChild(background, text);
        return container;
    }

    addControlButtons(node) {
        node.controlButtons = [];
        
        if (this.centers.includes(node)) {
            // Создаем кнопку "Добавить аргумент"
            const addArgBtn = this.createStyledButton('Добавить аргумент', this.app.screen.width - 300, 50, () => {
                const angle = Math.random() * Math.PI * 2;
                const newNode = {
                    label: `Аргумент ${node.nodes.length + 1}`,
                    coef: 0,
                    x: node.x + Math.cos(angle) * this.linkLength,
                    y: node.y + Math.sin(angle) * this.linkLength,
                    vx: 0,
                    vy: 0
                };
                
                this.nodeAngles.set(newNode, angle);
                this.nodeDistances.set(newNode, this.linkLength);
                this.nodeCenters.set(newNode, node);
                node.nodes.push(newNode);
                
                const link = this.createLink();
                const nodeSprite = this.createNode(this.getColor(newNode.coef, false), newNode.label, newNode.coef, false);
                
                nodeSprite.x = newNode.x;
                nodeSprite.y = newNode.y;
                
                this.linksContainer.addChild(link);
                this.nodesContainer.addChild(nodeSprite);
                
                newNode.link = link;
                newNode.sprite = nodeSprite;
            });
            
            node.controlButtons.push(addArgBtn);
            this.centersContainer.addChild(addArgBtn);
        }
    }

    createButton(text, x, y, onClick) {
        const button = new PIXI.Container();
        button.x = x;
        button.y = y;
        button.controlButton = true; // Добавляем метку для идентификации кнопок
        
        const graphics = new PIXI.Graphics();
        graphics.beginFill(0x666666);
        graphics.drawCircle(0, 0, 15);
        graphics.endFill();
        
        const textSprite = this.getText(text);
        textSprite.anchor.set(0.5);
        
        button.addChild(graphics, textSprite);
        button.eventMode = 'static';
        button.cursor = 'pointer';
        button.on('pointerdown', (e) => {
            e.stopPropagation();
            onClick();
        });
        
        return button;
    }

    createStyledButton(text, x, y, onClick) {
        const button = new PIXI.Container();
        button.x = x;
        button.y = y;
        button.controlButton = true;
        
        const graphics = new PIXI.Graphics();
        graphics.beginFill(0x222222);
        graphics.lineStyle(1, 0x666666);
        graphics.drawRoundedRect(-100, -15, 200, 30, 4);
        graphics.endFill();
        
        const textSprite = this.getText(text);
        textSprite.anchor.set(0.5);
        textSprite.style.fontSize = 14;
        textSprite.style.fill = '#cccccc';
        
        button.addChild(graphics, textSprite);
        button.eventMode = 'static';
        button.cursor = 'pointer';
        
        button.on('pointerover', () => {
            graphics.clear();
            graphics.beginFill(0x333333);
            graphics.lineStyle(1, 0x666666);
            graphics.drawRoundedRect(-100, -15, 200, 30, 4);
            graphics.endFill();
        });
        
        button.on('pointerout', () => {
            graphics.clear();
            graphics.beginFill(0x222222);
            graphics.lineStyle(1, 0x666666);
            graphics.drawRoundedRect(-100, -15, 200, 30, 4);
            graphics.endFill();
        });
        
        button.on('pointerdown', (e) => {
            e.stopPropagation();
            onClick();
        });
        
        return button;
    }

    createSmallStyledButton(text, x, y, onClick) {
        const button = new PIXI.Container();
        button.x = x;
        button.y = y;
        button.controlButton = true;
        
        const graphics = new PIXI.Graphics();
        graphics.beginFill(0x222222);
        graphics.lineStyle(1, 0x666666);
        graphics.drawRoundedRect(-50, -15, 100, 30, 4);
        graphics.endFill();
        
        const textSprite = this.getText(text);
        textSprite.anchor.set(0.5);
        textSprite.style.fontSize = 14;
        textSprite.style.fill = '#cccccc';
        
        button.addChild(graphics, textSprite);
        button.eventMode = 'static';
        button.cursor = 'pointer';
        
        button.on('pointerover', () => {
            graphics.clear();
            graphics.beginFill(0x333333);
            graphics.lineStyle(1, 0x666666);
            graphics.drawRoundedRect(-50, -15, 100, 30, 4);
            graphics.endFill();
        });
        
        button.on('pointerout', () => {
            graphics.clear();
            graphics.beginFill(0x222222);
            graphics.lineStyle(1, 0x666666);
            graphics.drawRoundedRect(-50, -15, 100, 30, 4);
            graphics.endFill();
        });
        
        button.on('pointerdown', (e) => {
            e.stopPropagation();
            onClick();
        });
        
        return button;
    }

    destroy() {
        // Выводим финальный отчет о памяти
        console.log('Final memory report:', this.profiler.getReport());
        
        // Останавливаем анимацию
        this.app.ticker.stop();
        
        // Удаляем обработчик изменения размера окна
        window.removeEventListener('resize', this.handleResize);
        
        // Уничтожаем все объекты
        this.mainContainer.destroy({ children: true });
        this.textPool.forEach(text => text.destroy());
        this.textPool.clear();
        
        // Удаляем приложение
        this.app.destroy(true, true);
        
        // Удаляем кнопку отчета о памяти
        const memoryButton = document.querySelector('button[style*="position: absolute"]');
        if (memoryButton) {
            memoryButton.remove();
        }
    }

    updateCentersPositions() {
        const spacing = this.app.screen.width / (this.centers.length + 1);
        this.centers.forEach((center, index) => {
            center.x = spacing * (index + 1);
            center.y = this.app.screen.height / 2;
            if (center.sprite) {
                center.sprite.x = center.x;
                center.sprite.y = center.y;
            }
        });
    }

    createAddCenterButton() {
        // Добавляем кнопку сохранения
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Сохранить';
        saveButton.style.position = 'absolute';
        saveButton.style.top = '10px';
        saveButton.style.left = '10px';
        saveButton.style.padding = '8px 16px';
        saveButton.style.backgroundColor = '#222222';
        saveButton.style.color = '#cccccc';
        saveButton.style.border = '1px solid #666666';
        saveButton.style.borderRadius = '4px';
        saveButton.style.cursor = 'pointer';
        saveButton.style.marginRight = '10px';
        
        saveButton.onclick = () => this.saveToJson();
        document.body.appendChild(saveButton);

        // Добавляем кнопку загрузки
        const loadButton = document.createElement('button');
        loadButton.textContent = 'Загрузить';
        loadButton.style.position = 'absolute';
        loadButton.style.top = '10px';
        loadButton.style.left = (saveButton.offsetWidth + 20) + 'px';
        loadButton.style.padding = '8px 16px';
        loadButton.style.backgroundColor = '#222222';
        loadButton.style.color = '#cccccc';
        loadButton.style.border = '1px solid #666666';
        loadButton.style.borderRadius = '4px';
        loadButton.style.cursor = 'pointer';
        
        loadButton.onclick = () => this.loadFromJson();
        document.body.appendChild(loadButton);

        // Добавляем кнопку для создания нового центра
        const addCenterButton = document.createElement('button');
        addCenterButton.textContent = 'Добавить вариант';
        addCenterButton.style.position = 'absolute';
        addCenterButton.style.top = '10px';
        addCenterButton.style.left = (saveButton.offsetWidth + loadButton.offsetWidth + 40) + 'px';
        addCenterButton.style.padding = '8px 16px';
        addCenterButton.style.backgroundColor = '#333333';
        addCenterButton.style.color = '#cccccc';
        addCenterButton.style.border = '1px solid #666666';
        addCenterButton.style.borderRadius = '4px';
        addCenterButton.style.cursor = 'pointer';
        
        addCenterButton.onclick = () => {
            const newCenter = {
                x: 0,
                y: this.app.screen.height / 2,
                coef: 0,
                vx: 0,
                vy: 0,
                label: `Вариант ${this.centers.length + 1}`,
                nodes: []
            };
            
            this.centers.push(newCenter);
            this.updateCentersPositions();
            
            const centerNode = this.createNode(this.getColor(newCenter.coef, true), newCenter.label, newCenter.coef, true);
            centerNode.x = newCenter.x;
            centerNode.y = newCenter.y;
            this.centersContainer.addChild(centerNode);
            newCenter.sprite = centerNode;
        };
        
        document.body.appendChild(addCenterButton);

        // Добавляем кнопку удаления центра
        const deleteCenterButton = document.createElement('button');
        deleteCenterButton.textContent = 'Удалить вариант';
        deleteCenterButton.style.position = 'absolute';
        deleteCenterButton.style.top = '10px';
        deleteCenterButton.style.left = (saveButton.offsetWidth + loadButton.offsetWidth + addCenterButton.offsetWidth + 60) + 'px';
        deleteCenterButton.style.padding = '8px 16px';
        deleteCenterButton.style.backgroundColor = '#333333';
        deleteCenterButton.style.color = '#cccccc';
        deleteCenterButton.style.border = '1px solid #666666';
        deleteCenterButton.style.borderRadius = '4px';
        deleteCenterButton.style.cursor = 'pointer';
        deleteCenterButton.style.display = 'none'; // Скрываем кнопку по умолчанию
        
        deleteCenterButton.onclick = () => {
            if (this.selectedNode && this.centers.includes(this.selectedNode) && this.centers.length > 1) {
                const index = this.centers.indexOf(this.selectedNode);
                if (index !== -1) {
                    for (const centerNode of this.selectedNode.nodes) {
                        this.nodesContainer.removeChild(centerNode.sprite);
                        this.linksContainer.removeChild(centerNode.link);
                    }
                    this.centersContainer.removeChild(this.selectedNode.sprite);
                    this.centers.splice(index, 1);
                    this.updateCentersPositions();
                    this.selectedNode = null;
                    this.updateSelection();
                    deleteCenterButton.style.display = 'none';
                }
            }
        };
        
        document.body.appendChild(deleteCenterButton);

        // Сохраняем ссылку на кнопку удаления в экземпляре класса
        this.deleteCenterButton = deleteCenterButton;
    }

    saveToJson() {
        const projectData = {
            centers: this.centers.map(center => ({
                x: center.x,
                y: center.y,
                coef: center.coef,
                label: center.label,
                nodes: center.nodes.map(node => ({
                    x: node.x,
                    y: node.y,
                    coef: node.coef,
                    label: node.label,
                    angle: this.nodeAngles.get(node),
                    distance: this.nodeDistances.get(node)
                }))
            }))
        };

        const jsonString = JSON.stringify(projectData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        // Создаем диалог сохранения файла
        const saveDialog = document.createElement('input');
        saveDialog.type = 'file';
        saveDialog.accept = '.json';
        saveDialog.style.display = 'none';
        document.body.appendChild(saveDialog);

        // Используем File System Access API, если он доступен
        if ('showSaveFilePicker' in window) {
            window.showSaveFilePicker({
                suggestedName: 'buoyancy_project.json',
                types: [{
                    description: 'JSON файл',
                    accept: {'application/json': ['.json']}
                }]
            }).then(fileHandle => {
                fileHandle.createWritable().then(writable => {
                    writable.write(blob);
                    writable.close();
                });
            }).catch(err => {
                if (err.name !== 'AbortError') {
                    console.error('Ошибка при сохранении файла:', err);
                    alert('Ошибка при сохранении файла');
                }
            });
        } else {
            // Fallback для браузеров без поддержки File System Access API
            const a = document.createElement('a');
            a.href = url;
            a.download = 'buoyancy_project.json';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
        
        URL.revokeObjectURL(url);
    }

    loadFromJson() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const projectData = JSON.parse(event.target.result);
                        this.clearCurrentProject();
                        this.loadProjectData(projectData);
                    } catch (error) {
                        console.error('Ошибка при загрузке проекта:', error);
                        alert('Ошибка при загрузке проекта. Проверьте формат файла.');
                    }
                };
                reader.readAsText(file);
            }
        };
        
        input.click();
    }

    clearCurrentProject() {
        // Удаляем все существующие узлы и центры
        for (const center of this.centers) {
            for (const node of center.nodes) {
                if (node.sprite) this.nodesContainer.removeChild(node.sprite);
                if (node.link) this.linksContainer.removeChild(node.link);
            }
            if (center.sprite) this.centersContainer.removeChild(center.sprite);
        }
        
        this.centers = [];
        this.nodeAngles.clear();
        this.nodeDistances.clear();
        this.nodeCenters.clear();
    }

    loadProjectData(projectData) {
        // Сбрасываем текущее выделение
        this.selectedNode = null;
        this.isDragging = false;
        this.draggedNode = null;
        
        // Создаем центры
        for (const centerData of projectData.centers) {
            const center = {
                x: centerData.x,
                y: centerData.y,
                coef: centerData.coef,
                vx: 0,
                vy: 0,
                label: centerData.label,
                nodes: []
            };
            
            this.centers.push(center);
            
            // Создаем спрайт центра
            const centerNode = this.createNode(this.getColor(center.coef, true), center.label, center.coef, true);
            centerNode.x = center.x;
            centerNode.y = center.y;
            this.centersContainer.addChild(centerNode);
            center.sprite = centerNode;
            
            // Создаем узлы центра
            for (const nodeData of centerData.nodes) {
                const node = {
                    x: nodeData.x,
                    y: nodeData.y,
                    coef: nodeData.coef,
                    label: nodeData.label,
                    vx: 0,
                    vy: 0
                };
                
                this.nodeAngles.set(node, nodeData.angle);
                this.nodeDistances.set(node, nodeData.distance);
                this.nodeCenters.set(node, center);
                center.nodes.push(node);
                
                const link = this.createLink();
                const nodeSprite = this.createNode(this.getColor(node.coef, false), node.label, node.coef, false);
                
                nodeSprite.x = node.x;
                nodeSprite.y = node.y;
                
                this.linksContainer.addChild(link);
                this.nodesContainer.addChild(nodeSprite);
                
                node.link = link;
                node.sprite = nodeSprite;
            }
        }
        
        // Обновляем z-index для всех элементов
        this.updateSelection();
        
        // Сбрасываем состояние перетаскивания
        this.isDragging = false;
        this.draggedNode = null;
    }
}

// Запускаем симуляцию после загрузки страницы
window.addEventListener('load', () => {
    new BuoyancySimulation();
}); 
