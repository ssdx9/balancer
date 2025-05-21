// Используем глобальные объекты из window
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

    constructor() {
        this.profiler = new MemoryProfiler();
        this.showMemoryReport = false; // Отключаем отчет о памяти
        this.isDemoMode = false; // Отключаем демо-режим
        this.isCtrlPressed = false;
        this.selectedNodes = new Set();
        this.aspects = new Map(); // Map для хранения аспектов
        
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
            if (this.agendaText) {
                this.agendaText.x = this.app.screen.width / 2;
                this.agendaText.style.fontSize = Math.min(72, window.innerHeight * 0.1);
                this.agendaText.style.wordWrapWidth = window.innerWidth * 0.8;
                this.agendaText.y = Math.min(100, window.innerHeight * 0.15);
            }
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
                label: 'Один \nвариант',
                nodes: []
            },
            {
                x: this.app.screen.width * 2/3,
                y: this.app.screen.height / 2,
                coef: 0,
                vx: 0,
                vy: 0,
                label: 'Другой \nвариант',
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
                        zIndex: 10 + i
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
            center.zIndex = 100;
            this.centersContainer.addChild(centerNode);
            center.sprite = centerNode;
        }
    }

    createText(content, width) {
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
        let labelText = this.createText(label, this.maxNodeWidth);
        
        let width = labelText.width + this.padding * 2;
        width = Math.min(Math.max(width, this.minNodeWidth), this.maxNodeWidth);
        
        let requiredHeight = labelText.height + this.padding * 2;
        
        if (requiredHeight > this.maxNodeHeight) {
            const scale = (this.maxNodeHeight - this.padding * 2) / labelText.height;
            const newFontSize = Math.floor(18 * scale);
            
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
        
        let height = Math.min(Math.max(requiredHeight, this.minNodeHeight), this.maxNodeHeight);
        
        return { width, height, labelText };
    }

    layoutNode(node, color, label, coef) {
        if (node.labelText && node.labelText.parent) node.removeChild(node.labelText);
        if (node.coefText && node.coefText.parent) node.removeChild(node.coefText);
        if (node.labelText) node.labelText.destroy();
        if (node.coefText) node.coefText.destroy();

        const { width, height, labelText } = this.calculateNodeDimensions(label);

        if (!node.graphics) {
            node.graphics = new PIXI.Graphics();
            node.addChildAt(node.graphics, 0);
        }
        node.graphics.clear();
        node.graphics.beginFill(color);
        node.graphics.drawRoundedRect(-width/2, -height/2, width, height, 10);
        node.graphics.endFill();

        labelText.anchor.set(0.5, 0.5);
        labelText.x = 0;
        labelText.y = 0;
        node.addChild(labelText);

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
        return new PIXI.Text(content, this.textStyle);
    }

    updateNode(node, color, label, coef) {
        if (node.lastCoef !== coef || node.lastColor !== color || node.lastLabel !== label) {
            this.layoutNode(node, color, label, coef);
            
            if (node === this.centerNode) {
                const panel = document.querySelector('div[style*="position: absolute"]');
                if (panel) {
                    const title = panel.querySelector('b');
                    if (title) {
                        title.textContent = label;
                    }
                }
            }
            
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

            if (this.selectedNode) {
                const selectedSprite = this.selectedNode.sprite;
                selectedSprite.zIndex = 1000;
            }
            
            for (const center of this.centers) {
                center.sprite.zIndex = 100;
                
                let sumCoef = 0;
                for (const node of center.nodes) {
                    sumCoef += node.coef;
                }
                center.coef = sumCoef;

                const targetY = this.app.screen.height / 2 - sumCoef * 18;
                const centerForce = (targetY - center.y) * 0.05;
                center.vy += centerForce;
                center.vy *= 0.7;
                center.y += center.vy;
                center.sprite.y = center.y;

                for (const otherCenter of this.centers) {
                    if (center !== otherCenter) {
                        const dx = center.x - otherCenter.x;
                        const dy = center.y - otherCenter.y;
                        const distance = Math.sqrt(dx * dx + dy * dy);
                        const minDistance = this.centerRadius * 2.5;
                        
                        if (distance < minDistance) {
                            const force = (minDistance - distance) * 0.05;
                            const angle = Math.atan2(dy, dx);
                            center.vx += Math.cos(angle) * force;
                            otherCenter.vx -= Math.cos(angle) * force;
                        }
                    }
                }

                center.vx *= 0.8;

                for (const node of center.nodes) {
                    const sprite = node.sprite;
                    const link = node.link;
                    const angle = this.nodeAngles.get(node);
                    const distance = this.nodeDistances.get(node);

                    // Проверяем, не является ли узел частью анимирующегося аспекта
                    let isAnimating = false;
                    for (const aspect of this.aspects.values()) {
                        if (aspect.isAnimating && aspect.nodes.includes(node)) {
                            isAnimating = true;
                            break;
                        }
                    }

                    if (!isAnimating && (!this.isDragging || node !== this.draggedNode)) {
                        // Применяем физику только если узел не является частью аспекта
                        if (!node.isAspectNode) {
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
                        }

                        const dxToCenter = node.x - center.x;
                        const dyToCenter = node.y - center.y;
                        const distanceToCenter = Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter);
                        const minDistanceToCenter = this.centerRadius + this.nodeRadius;
                        
                        if (distanceToCenter < minDistanceToCenter) {
                            const force = (minDistanceToCenter - distanceToCenter) * 0.08;
                            const angle = Math.atan2(dyToCenter, dxToCenter);
                            node.vx += Math.cos(angle) * force;
                            center.vx -= Math.cos(angle) * force * 0.5;
                            node.vy += Math.sin(angle) * force;
                            center.vy -= Math.sin(angle) * force * 0.5;
                        }

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

                this.updateNode(center.sprite, this.getColor(center.coef, true), center.label, center.coef);
            }
        });
    }

    getColor(coef, isCenter = false) {
        if (isCenter) {
            if (coef > 2) return 0x4cff4c;
            if (coef > 0) return 0x3ca03c;
            if (coef === 0) return 0x4a4a4a;
            if (coef > -2) return 0xa04c4c;
            return 0xff4c4c;
        } else {
            if (coef > 0) {
                if (coef >= 5) return 0x007700;
                if (coef >= 4) return 0x006600;
                if (coef >= 3) return 0x005500;
                if (coef >= 2) return 0x004400;
                return 0x003300;
            } else if (coef < 0) {
                if (coef <= -5) return 0x770000;
                if (coef <= -4) return 0x660000;
                if (coef <= -3) return 0x550000;
                if (coef <= -2) return 0x440000;
                return 0x330000;
            }
            return 0x333333;
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

    setupInteraction() {
        this.app.stage.eventMode = 'static';
        this.app.stage.hitArea = this.app.screen;
        
        // Добавляем обработчики для Ctrl
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Control') {
                this.isCtrlPressed = true;
            }
        });
        
        window.addEventListener('keyup', (e) => {
            if (e.key === 'Control') {
                this.isCtrlPressed = false;
            }
        });

        // Добавляем обработчики также на уровне document
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Control') {
                this.isCtrlPressed = true;
            }
        });
        
        document.addEventListener('keyup', (e) => {
            if (e.key === 'Control') {
                this.isCtrlPressed = false;
            }
        });
        
        this.app.stage.on('pointerdown', (e) => {
            const pos = e.getLocalPosition(this.mainContainer);
            let clickedNode = null;
            let clickedAspect = null;
            
            // Сначала проверяем, не кликнули ли мы по узлу аспекта
            for (const aspect of this.aspects.values()) {
                for (const node of aspect.nodes) {
                    if (this.isPointInNode(pos, node.sprite)) {
                        clickedNode = node;
                        clickedAspect = aspect;
                        break;
                    }
                }
                if (clickedNode) break;
            }
            
            // Если не нашли узел аспекта, проверяем обычные узлы и центры
            if (!clickedNode) {
            for (const center of this.centers) {
                if (this.isPointInNode(pos, center.sprite)) {
                    clickedNode = center;
                    break;
                }
                
                for (const node of center.nodes) {
                    if (this.isPointInNode(pos, node.sprite)) {
                        clickedNode = node;
                        break;
                    }
                }
                
                if (clickedNode) break;
                }
            }
            
            let currentTarget = e.target;
            while (currentTarget) {
                if (currentTarget.controlButton === true) {
                    return;
                }
                currentTarget = currentTarget.parent;
            }
            
            if (clickedNode) {
                if (clickedAspect) {
                    // Обработка клика по аспекту
                    this.selectedNodes.clear();
                    clickedAspect.nodes.forEach(node => this.selectedNodes.add(node));
                this.isDragging = true;
                this.draggedNode = clickedNode;
                this.dragStartX = pos.x;
                this.dragStartY = pos.y;
                this.updateSelection();
                } else if (this.centers.includes(clickedNode)) {
                    // Обработка клика по центру
                    this.selectedNodes.clear();
                    this.selectedNodes.add(clickedNode);
                    this.updateSelection();
                } else if (this.isCtrlPressed) {
                    // Множественное выделение аргументов
                    if (this.selectedNodes.has(clickedNode)) {
                        this.selectedNodes.delete(clickedNode);
                    } else {
                        this.selectedNodes.add(clickedNode);
                    }
                    this.updateSelection();
                } else {
                    // Одиночное выделение аргумента
                    this.selectedNodes.clear();
                    this.selectedNodes.add(clickedNode);
                    this.isDragging = true;
                    this.draggedNode = clickedNode;
                    this.dragStartX = pos.x;
                    this.dragStartY = pos.y;
                this.updateSelection();
                }
            } else if (!clickedNode) {
                if (!this.isCtrlPressed) {
                    this.selectedNodes.clear();
                    this.updateSelection();
                }
            }
        });

        this.app.stage.on('pointermove', (e) => {
            if (this.isDragging && this.draggedNode) {
                const pos = e.getLocalPosition(this.mainContainer);
                const dx = pos.x - this.dragStartX;
                const dy = pos.y - this.dragStartY;
                
                if (this.draggedNode.aspect) {
                    // Перемещаем весь аспект
                    const aspect = this.draggedNode.aspect;
                    aspect.x += dx;
                    aspect.y += dy;
                    
                    // Обновляем позиции всех узлов аспекта
                    let currentX = 0;
                    const nodePositions = aspect.nodes.map(node => {
                        const width = node.sprite.width;
                        const position = {
                            x: currentX,
                            width: width
                        };
                        currentX += width;
                        return position;
                    });
                    
                    const totalWidth = currentX;
                    const startX = aspect.x - totalWidth / 2;
                    
                    aspect.nodes.forEach((node, index) => {
                        node.x = startX + nodePositions[index].x;
                        node.y = aspect.y;
                        
                        // Обновляем связи
                        const center = this.nodeCenters.get(node);
                        const dxToCenter = node.x - center.x;
                        const dyToCenter = node.y - center.y;
                        const angle = Math.atan2(dyToCenter, dxToCenter);
                        const distance = Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter);
                        
                        this.nodeAngles.set(node, angle);
                        this.nodeDistances.set(node, distance);
                    });
                } else if (this.selectedNodes.size > 1) {
                    // Перемещаем все выделенные узлы
                    for (const node of this.selectedNodes) {
                        node.x += dx;
                        node.y += dy;
                        
                        const center = this.nodeCenters.get(node);
                        const dxToCenter = node.x - center.x;
                        const dyToCenter = node.y - center.y;
                        const angle = Math.atan2(dyToCenter, dxToCenter);
                        const distance = Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter);
                        
                        this.nodeAngles.set(node, angle);
                        this.nodeDistances.set(node, distance);
                    }
                } else {
                this.draggedNode.x += dx;
                this.draggedNode.y += dy;
                
                const center = this.nodeCenters.get(this.draggedNode);
                const dxToCenter = this.draggedNode.x - center.x;
                const dyToCenter = this.draggedNode.y - center.y;
                const angle = Math.atan2(dyToCenter, dxToCenter);
                const distance = Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter);
                
                this.nodeAngles.set(this.draggedNode, angle);
                this.nodeDistances.set(this.draggedNode, distance);
                }
                
                this.dragStartX = pos.x;
                this.dragStartY = pos.y;
            }
        });

        this.app.stage.on('pointerup', () => {
            if (this.draggedNode) {
                if (this.draggedNode.aspect) {
                    const aspect = this.draggedNode.aspect;
                    // Обновляем позиции всех узлов аспекта
                    let currentX = 0;
                    const nodePositions = aspect.nodes.map(node => {
                        const width = node.sprite.width;
                        const position = {
                            x: currentX,
                            width: width
                        };
                        currentX += width;
                        return position;
                    });
                    
                    const totalWidth = currentX;
                    const startX = aspect.x - totalWidth / 2;
                    
                    aspect.nodes.forEach((node, index) => {
                        node.x = startX + nodePositions[index].x;
                        node.y = aspect.y;
                        
                        // Обновляем связи
                        const center = this.nodeCenters.get(node);
                        const dxToCenter = node.x - center.x;
                        const dyToCenter = node.y - center.y;
                        const angle = Math.atan2(dyToCenter, dxToCenter);
                        const distance = Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter);
                        
                        this.nodeAngles.set(node, angle);
                        this.nodeDistances.set(node, distance);
                    });
                } else if (this.selectedNodes.size > 1) {
                    // Обновляем углы и расстояния для всех выделенных узлов
                    for (const node of this.selectedNodes) {
                        const center = this.nodeCenters.get(node);
                        const dxToCenter = node.x - center.x;
                        const dyToCenter = node.y - center.y;
                        const angle = Math.atan2(dyToCenter, dxToCenter);
                        const distance = Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter);
                        
                        this.nodeAngles.set(node, angle);
                        this.nodeDistances.set(node, distance);
                    }
                } else {
                const center = this.nodeCenters.get(this.draggedNode);
                const dxToCenter = this.draggedNode.x - center.x;
                const dyToCenter = this.draggedNode.y - center.y;
                const angle = Math.atan2(dyToCenter, dxToCenter);
                const distance = Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter);
                
                this.nodeAngles.set(this.draggedNode, angle);
                this.nodeDistances.set(this.draggedNode, distance);
                }
            }
            this.isDragging = false;
            this.draggedNode = null;
        });

        this.app.stage.on('pointerupoutside', () => {
            if (this.draggedNode) {
                if (this.draggedNode.aspect) {
                    const aspect = this.draggedNode.aspect;
                    // Обновляем позиции всех узлов аспекта
                    let currentX = 0;
                    const nodePositions = aspect.nodes.map(node => {
                        const width = node.sprite.width;
                        const position = {
                            x: currentX,
                            width: width
                        };
                        currentX += width;
                        return position;
                    });
                    
                    const totalWidth = currentX;
                    const startX = aspect.x - totalWidth / 2;
                    
                    aspect.nodes.forEach((node, index) => {
                        node.x = startX + nodePositions[index].x;
                        node.y = aspect.y;
                        
                        // Обновляем связи
                        const center = this.nodeCenters.get(node);
                        const dxToCenter = node.x - center.x;
                        const dyToCenter = node.y - center.y;
                        const angle = Math.atan2(dyToCenter, dxToCenter);
                        const distance = Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter);
                        
                        this.nodeAngles.set(node, angle);
                        this.nodeDistances.set(node, distance);
                    });
                } else if (this.selectedNodes.size > 1) {
                    // Обновляем углы и расстояния для всех выделенных узлов
                    for (const node of this.selectedNodes) {
                        const center = this.nodeCenters.get(node);
                        const dxToCenter = node.x - center.x;
                        const dyToCenter = node.y - center.y;
                        const angle = Math.atan2(dyToCenter, dxToCenter);
                        const distance = Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter);
                        
                        this.nodeAngles.set(node, angle);
                        this.nodeDistances.set(node, distance);
                    }
                } else {
                const center = this.nodeCenters.get(this.draggedNode);
                const dxToCenter = this.draggedNode.x - center.x;
                const dyToCenter = this.draggedNode.y - center.y;
                const angle = Math.atan2(dyToCenter, dxToCenter);
                const distance = Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter);
                
                this.nodeAngles.set(this.draggedNode, angle);
                this.nodeDistances.set(this.draggedNode, distance);
                }
            }
            this.isDragging = false;
            this.draggedNode = null;
        });

        window.addEventListener('keydown', (e) => {
            const activeElement = document.activeElement;
            if (activeElement && activeElement.tagName === 'TEXTAREA') {
                return;
            }
            
            if (e.key === 'Delete' && this.selectedNodes.size > 0) {
                const nodesToDelete = Array.from(this.selectedNodes).filter(node => !this.centers.includes(node));
                for (const node of nodesToDelete) {
                    const center = this.nodeCenters.get(node);
                    const index = center.nodes.indexOf(node);
                    if (index !== -1) {
                        this.nodesContainer.removeChild(node.sprite);
                        this.linksContainer.removeChild(node.link);
                        center.nodes.splice(index, 1);
                    }
                }
                this.selectedNodes.clear();
                this.updateSelection();
            }

            if (this.selectedNode) {
                if (e.key === 'ArrowUp') {
                    this.selectedNode.coef = Math.min(5, this.selectedNode.coef + 1);
                    this.updateNode(this.selectedNode.sprite, this.getColor(this.selectedNode.coef, this.centers.includes(this.selectedNode)), this.selectedNode.label, this.selectedNode.coef);
                    this.selectedNode.sprite.graphics.lineStyle(3, 0xffffff, 1);
                    this.selectedNode.sprite.graphics.drawRoundedRect(-this.selectedNode.sprite.width/2, -this.selectedNode.sprite.height/2, this.selectedNode.sprite.width, this.selectedNode.sprite.height, 10);
                    
                    const existingCoefIndicator = this.nodesContainer.children.find(child => child.coefIndicator === true);
                    if (existingCoefIndicator) {
                        this.nodesContainer.removeChild(existingCoefIndicator);
                    }

                    // Проверяем, является ли узел частью аспекта
                    let aspectId = null;
                    for (const [id, aspect] of this.aspects.entries()) {
                        if (aspect.nodes.includes(this.selectedNode)) {
                            aspectId = id;
                            break;
                        }
                    }

                    if (aspectId) {
                        // Если узел часть аспекта, показываем сумму коэффициентов
                        const aspect = this.aspects.get(aspectId);
                        const aspectCoef = aspect.nodes.reduce((sum, node) => sum + node.coef, 0);
                        const newCoefIndicator = this.createCoefIndicator(aspectCoef);
                        newCoefIndicator.x = this.app.screen.width - 100;
                        newCoefIndicator.y = 50;
                        newCoefIndicator.coefIndicator = true;
                        this.nodesContainer.addChild(newCoefIndicator);
                    } else {
                        // Иначе показываем коэффициент самого узла
                        const newCoefIndicator = this.createCoefIndicator(this.selectedNode.coef);
                        newCoefIndicator.x = this.app.screen.width - 100;
                        newCoefIndicator.y = 50;
                        newCoefIndicator.coefIndicator = true;
                        this.nodesContainer.addChild(newCoefIndicator);
                    }
                } else if (e.key === 'ArrowDown') {
                    this.selectedNode.coef = Math.max(-5, this.selectedNode.coef - 1);
                    this.updateNode(this.selectedNode.sprite, this.getColor(this.selectedNode.coef, this.centers.includes(this.selectedNode)), this.selectedNode.label, this.selectedNode.coef);
                    this.selectedNode.sprite.graphics.lineStyle(3, 0xffffff, 1);
                    this.selectedNode.sprite.graphics.drawRoundedRect(-this.selectedNode.sprite.width/2, -this.selectedNode.sprite.height/2, this.selectedNode.sprite.width, this.selectedNode.sprite.height, 10);
                    
                    const existingCoefIndicator = this.nodesContainer.children.find(child => child.coefIndicator === true);
                    if (existingCoefIndicator) {
                        this.nodesContainer.removeChild(existingCoefIndicator);
                    }

                    // Проверяем, является ли узел частью аспекта
                    let aspectId = null;
                    for (const [id, aspect] of this.aspects.entries()) {
                        if (aspect.nodes.includes(this.selectedNode)) {
                            aspectId = id;
                            break;
                        }
                    }

                    if (aspectId) {
                        // Если узел часть аспекта, показываем сумму коэффициентов
                        const aspect = this.aspects.get(aspectId);
                        const aspectCoef = aspect.nodes.reduce((sum, node) => sum + node.coef, 0);
                        const newCoefIndicator = this.createCoefIndicator(aspectCoef);
                        newCoefIndicator.x = this.app.screen.width - 100;
                        newCoefIndicator.y = 50;
                        newCoefIndicator.coefIndicator = true;
                        this.nodesContainer.addChild(newCoefIndicator);
                    } else {
                        // Иначе показываем коэффициент самого узла
                        const newCoefIndicator = this.createCoefIndicator(this.selectedNode.coef);
                        newCoefIndicator.x = this.app.screen.width - 100;
                        newCoefIndicator.y = 50;
                        newCoefIndicator.coefIndicator = true;
                        this.nodesContainer.addChild(newCoefIndicator);
                    }
                }
            } else if (this.selectedNodes.size > 1) {
                // Проверяем, все ли выделенные узлы принадлежат одному аспекту
                let commonAspectId = null;
                for (const [id, aspect] of this.aspects.entries()) {
                    const allSelectedInThisAspect = Array.from(this.selectedNodes).every(node => aspect.nodes.includes(node));
                    if (allSelectedInThisAspect) {
                        commonAspectId = id;
                        break;
                    }
                }

                if (commonAspectId) {
                    const aspect = this.aspects.get(commonAspectId);
                    if (e.key === 'ArrowUp') {
                        // Увеличиваем коэффициент всех выделенных узлов
                        for (const node of this.selectedNodes) {
                            node.coef = Math.min(5, node.coef + 1);
                            this.updateNode(node.sprite, this.getColor(node.coef, false), node.label, node.coef);
                            node.sprite.graphics.lineStyle(3, 0xffffff, 1);
                            node.sprite.graphics.drawRoundedRect(-node.sprite.width/2, -node.sprite.height/2, node.sprite.width, node.sprite.height, 10);
                        }
                    } else if (e.key === 'ArrowDown') {
                        // Уменьшаем коэффициент всех выделенных узлов
                        for (const node of this.selectedNodes) {
                            node.coef = Math.max(-5, node.coef - 1);
                            this.updateNode(node.sprite, this.getColor(node.coef, false), node.label, node.coef);
                            node.sprite.graphics.lineStyle(3, 0xffffff, 1);
                            node.sprite.graphics.drawRoundedRect(-node.sprite.width/2, -node.sprite.height/2, node.sprite.width, node.sprite.height, 10);
                        }
                    }

                    // Обновляем индикатор коэффициента аспекта
                    const existingCoefIndicator = this.nodesContainer.children.find(child => child.coefIndicator === true);
                    if (existingCoefIndicator) {
                        this.nodesContainer.removeChild(existingCoefIndicator);
                    }
                    const aspectCoef = aspect.nodes.reduce((sum, node) => sum + node.coef, 0);
                    const newCoefIndicator = this.createCoefIndicator(aspectCoef);
                    newCoefIndicator.x = this.app.screen.width - 100;
                    newCoefIndicator.y = 50;
                    newCoefIndicator.coefIndicator = true;
                    this.nodesContainer.addChild(newCoefIndicator);
                }
            }
        });
    }

    isPointInNode(point, node) {
        const dx = point.x - node.x;
        const dy = point.y - node.y;
        const width = node.width || this.nodeRadius * 2;
        const height = node.height || 70;
        return Math.abs(dx) < width/2 && Math.abs(dy) < height/2;
    }

    startTextEditing(node) {
        const isCenter = this.centers.includes(node);
        const sprite = node.sprite;
        
        // Сохраняем оригинальный текст и временно удаляем его из спрайта
        const originalText = sprite.labelText;
        if (originalText && originalText.parent) {
            originalText.parent.removeChild(originalText);
        }
        
        // Создаем текстовое поле
        const textInput = document.createElement('textarea');
        textInput.value = node.label;
        textInput.style.position = 'absolute';
        textInput.style.backgroundColor = 'transparent';
        textInput.style.border = 'none';
        textInput.style.outline = 'none';
        textInput.style.color = '#ffffff';
        textInput.style.fontSize = '18px';
        textInput.style.fontWeight = 'bold';
        textInput.style.textAlign = 'center';
        textInput.style.width = (sprite.width - this.padding * 2) + 'px';
        textInput.style.height = 'auto';
        textInput.style.minHeight = (sprite.height - this.padding * 2) + 'px';
        textInput.style.resize = 'none';
        textInput.style.overflow = 'hidden';
        textInput.style.padding = '0';
        textInput.style.margin = '0';
        textInput.style.fontFamily = 'Arial, sans-serif';
        textInput.style.zIndex = '1000';
        
        // Позиционируем текстовое поле
        const rect = sprite.getBounds();
        const globalPos = sprite.toGlobal(new PIXI.Point(0, 0));
        textInput.style.left = (globalPos.x - rect.width/2 + this.padding) + 'px';
        textInput.style.top = (globalPos.y - rect.height/2 + this.padding) + 'px';
        
        // Добавляем текстовое поле на страницу
        document.body.appendChild(textInput);
        
        // Фокусируемся на текстовом поле и выделяем весь текст
        textInput.focus();
        textInput.select();
        
        // Функция для автоматической подстройки высоты
        const adjustHeight = () => {
            textInput.style.height = 'auto';
            textInput.style.height = (textInput.scrollHeight) + 'px';
        };
        
        // Функция для обновления размеров спрайта
        const updateSpriteSize = () => {
            const newLabel = textInput.value.trim();
            if (newLabel) {
                // Сначала подстраиваем высоту текстового поля
                adjustHeight();
                
                const { width, height } = this.calculateNodeDimensions(newLabel);
                sprite.width = width;
                sprite.height = height;
                
                // Обновляем только графику, без текста
                if (!sprite.graphics) {
                    sprite.graphics = new PIXI.Graphics();
                    sprite.addChildAt(sprite.graphics, 0);
                }
                sprite.graphics.clear();
                sprite.graphics.beginFill(this.getColor(node.coef, isCenter));
                sprite.graphics.drawRoundedRect(-width/2, -height/2, width, height, 10);
                sprite.graphics.endFill();
                
                // Обновляем позицию текстового поля
                const newRect = sprite.getBounds();
                const newGlobalPos = sprite.toGlobal(new PIXI.Point(0, 0));
                textInput.style.left = (newGlobalPos.x - newRect.width/2 + this.padding) + 'px';
                textInput.style.top = (newGlobalPos.y - newRect.height/2 + this.padding) + 'px';
                textInput.style.width = (width - this.padding * 2) + 'px';
                textInput.style.minHeight = (height - this.padding * 2) + 'px';
            }
        };
        
        // Флаг для отслеживания, было ли уже выполнено завершение редактирования
        let isEditingFinished = false;
        
        const finishEditing = () => {
            if (isEditingFinished) return;
            isEditingFinished = true;
            
            const newLabel = textInput.value.trim();
            if (newLabel) {
                node.label = newLabel;
                this.updateNode(sprite, this.getColor(node.coef, isCenter), newLabel, node.coef);
                if (isCenter) {
                    this.updateCentersPositions();
                }
            }
            
            if (textInput.parentNode === document.body) {
                document.body.removeChild(textInput);
            }
        };
        
        // Обработчики событий
        textInput.addEventListener('input', updateSpriteSize);
        textInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                finishEditing();
            }
        });
        textInput.addEventListener('blur', finishEditing);
        
        // Предотвращаем закрытие при клике на текстовое поле
        textInput.onclick = (e) => {
            e.stopPropagation();
        };
    }

    updateSelection() {
        // Сначала очищаем все рамки выделения
        for (const center of this.centers) {
            for (const node of center.nodes) {
                if (node.sprite) {
                    node.sprite.graphics.clear();
                    this.layoutNode(node.sprite, this.getColor(node.coef, false), node.label, node.coef);
                }
            }
            if (center.sprite) {
                center.sprite.graphics.clear();
                this.layoutNode(center.sprite, this.getColor(center.coef, true), center.label, center.coef);
            }
        }

        for (const center of this.centers) {
            center.nodes.sort((a, b) => b.zIndex - a.zIndex);
            
            center.sprite.zIndex = center.zIndex;
            this.layoutNode(center.sprite, this.getColor(center.coef, true), center.label, center.coef);
            
            center.nodes.forEach(node => {
                if (!this.selectedNodes.has(node)) {
                    node.sprite.zIndex = node.zIndex;
                    this.layoutNode(node.sprite, this.getColor(node.coef, false), node.label, node.coef);
                }
            });
        }

        this.nodesContainer.sortChildren();
        this.centersContainer.sortChildren();

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

        for (const center of this.centers) {
            center.controlButtons = [];
            for (const node of center.nodes) {
                node.controlButtons = [];
            }
        }

        if (this.selectedNodes.size > 0) {
            // Проверяем, все ли выделенные узлы принадлежат одному аспекту
            let commonAspectId = null;
            let allNodesInSameAspect = true;
            
            for (const [id, aspect] of this.aspects.entries()) {
                const allSelectedInThisAspect = Array.from(this.selectedNodes).every(node => aspect.nodes.includes(node));
                if (allSelectedInThisAspect) {
                    commonAspectId = id;
                    break;
                }
            }

            for (const selectedNode of this.selectedNodes) {
                const selectedSprite = selectedNode.sprite;
                const currentZIndex = selectedNode.zIndex;
                selectedNode.zIndex = 1000;
                selectedSprite.zIndex = 1000;
                
                const container = selectedSprite.parent;
                if (container) {
                    container.removeChild(selectedSprite);
                    container.addChild(selectedSprite);
                }
                
                // Проверяем, является ли узел частью аспекта
                let isPartOfAspect = false;
                for (const aspect of this.aspects.values()) {
                    if (aspect.nodes.includes(selectedNode)) {
                        isPartOfAspect = true;
                        break;
                    }
                }
                
                if (isPartOfAspect) {
                    selectedSprite.graphics.lineStyle(3, 0xffff00, 1);
                } else {
                    selectedSprite.graphics.lineStyle(3, 0xffffff, 1);
                }
                selectedSprite.graphics.drawRoundedRect(-selectedSprite.width/2, -selectedSprite.height/2, selectedSprite.width, selectedSprite.height, 10);
            }

            if (this.selectedNodes.size === 1) {
                const selectedNode = Array.from(this.selectedNodes)[0];
                
                if (this.centers.includes(selectedNode)) {
                    // Обработка выделенного центра
                    this.deleteCenterButton.style.display = 'block';
                    this.addControlButtons(selectedNode);
                    
                    // Добавляем индикатор коэффициента для центра
                    const coefIndicator = this.createCoefIndicator(selectedNode.coef);
                    coefIndicator.x = this.app.screen.width - 100;
                    coefIndicator.y = 50;
                    coefIndicator.coefIndicator = true;
                    this.nodesContainer.addChild(coefIndicator);
                } else {
                    // Проверяем, является ли узел частью аспекта
                    let isPartOfAspect = false;
                    let aspectId = null;
                    for (const [id, aspect] of this.aspects.entries()) {
                        if (aspect.nodes.includes(selectedNode)) {
                            isPartOfAspect = true;
                            aspectId = id;
                            break;
                        }
                    }
                    
                    if (!isPartOfAspect) {
                        // Обработка выделенного аргумента
                        const coefIndicator = this.createCoefIndicator(selectedNode.coef);
                        coefIndicator.x = this.app.screen.width - 100;
                        coefIndicator.y = 50;
                        coefIndicator.coefIndicator = true;
                        this.nodesContainer.addChild(coefIndicator);

                        const plusBtn = this.createSmallStyledButton('За', this.app.screen.width - 180, 50, () => {
                            selectedNode.coef = Math.min(5, selectedNode.coef + 1);
                            this.updateNode(selectedNode.sprite, this.getColor(selectedNode.coef, false), selectedNode.label, selectedNode.coef);
                            selectedNode.sprite.graphics.lineStyle(3, 0xffffff, 1);
                            selectedNode.sprite.graphics.drawRoundedRect(-selectedNode.sprite.width/2, -selectedNode.sprite.height/2, selectedNode.sprite.width, selectedNode.sprite.height, 10);
                            
                            const existingCoefIndicator = this.nodesContainer.children.find(child => child.coefIndicator === true);
                            if (existingCoefIndicator) {
                                this.nodesContainer.removeChild(existingCoefIndicator);
                            }
                            const newCoefIndicator = this.createCoefIndicator(selectedNode.coef);
                            newCoefIndicator.x = this.app.screen.width - 100;
                            newCoefIndicator.y = 50;
                            newCoefIndicator.coefIndicator = true;
                            this.nodesContainer.addChild(newCoefIndicator);
                        });

                        const minusBtn = this.createSmallStyledButton('Против', this.app.screen.width - 300, 50, () => {
                            selectedNode.coef = Math.max(-5, selectedNode.coef - 1);
                            this.updateNode(selectedNode.sprite, this.getColor(selectedNode.coef, false), selectedNode.label, selectedNode.coef);
                            selectedNode.sprite.graphics.lineStyle(3, 0xffffff, 1);
                            selectedNode.sprite.graphics.drawRoundedRect(-selectedNode.sprite.width/2, -selectedNode.sprite.height/2, selectedNode.sprite.width, selectedNode.sprite.height, 10);
                            
                            const existingCoefIndicator = this.nodesContainer.children.find(child => child.coefIndicator === true);
                            if (existingCoefIndicator) {
                                this.nodesContainer.removeChild(existingCoefIndicator);
                            }
                            const newCoefIndicator = this.createCoefIndicator(selectedNode.coef);
                            newCoefIndicator.x = this.app.screen.width - 100;
                            newCoefIndicator.y = 50;
                            newCoefIndicator.coefIndicator = true;
                            this.nodesContainer.addChild(newCoefIndicator);
                        });

                        this.nodesContainer.addChild(plusBtn, minusBtn);
                    } else {
                        // Добавляем кнопку разъединения аспекта
                        const splitButton = this.createStyledButton('Разъединить аспект', this.app.screen.width - 300, 50, () => {
                            this.splitAspect(aspectId);
                            this.updateSelection();
                        });
                        this.nodesContainer.addChild(splitButton);

                        // Добавляем индикатор коэффициента для аспекта
                        const aspect = this.aspects.get(aspectId);
                        const aspectCoef = aspect.nodes.reduce((sum, node) => sum + node.coef, 0);
                        const coefIndicator = this.createCoefIndicator(aspectCoef);
                        coefIndicator.x = this.app.screen.width - 100;
                        coefIndicator.y = 50;
                        coefIndicator.coefIndicator = true;
                        this.nodesContainer.addChild(coefIndicator);
                    }
                }
            } else if (this.selectedNodes.size > 1) {
                // Проверяем, что все выделенные узлы - аргументы
                const allAreArguments = Array.from(this.selectedNodes).every(node => !this.centers.includes(node));
                
                if (allAreArguments) {
                    if (commonAspectId !== null) {
                        // Если все выделенные узлы принадлежат одному аспекту, показываем кнопку разъединения
                        const splitButton = this.createStyledButton('Разъединить аспект', this.app.screen.width - 300, 50, () => {
                            this.splitAspect(commonAspectId);
                            this.updateSelection();
                        });
                        this.nodesContainer.addChild(splitButton);

                        // Добавляем индикатор коэффициента для аспекта
                        const aspect = this.aspects.get(commonAspectId);
                        const aspectCoef = aspect.nodes.reduce((sum, node) => sum + node.coef, 0);
                        const coefIndicator = this.createCoefIndicator(aspectCoef);
                        coefIndicator.x = this.app.screen.width - 100;
                        coefIndicator.y = 50;
                        coefIndicator.coefIndicator = true;
                        this.nodesContainer.addChild(coefIndicator);
                    } else {
                        // Проверяем, что все узлы не являются частью аспекта
                        const allAreNotInAspect = Array.from(this.selectedNodes).every(node => {
                            for (const aspect of this.aspects.values()) {
                                if (aspect.nodes.includes(node)) {
                                    return false;
                                }
                            }
                            return true;
                        });
                        
                        if (allAreNotInAspect) {
                            // Добавляем кнопку объединения в аспект
                            const mergeButton = this.createStyledButton('Объединить в аспект', this.app.screen.width - 300, 50, () => {
                                const aspect = this.createAspect(Array.from(this.selectedNodes));
                                this.updateSelection();
                            });
                            this.nodesContainer.addChild(mergeButton);
                        }
                    }
                }
            }
            
            if (this.deleteCenterButton) {
                this.deleteCenterButton.style.display = Array.from(this.selectedNodes).some(node => this.centers.includes(node)) ? 'block' : 'none';
            }
        } else {
            if (this.deleteCenterButton) {
                this.deleteCenterButton.style.display = 'none';
            }
            const existingCoefIndicator = this.nodesContainer.children.find(child => child.coefIndicator === true);
            if (existingCoefIndicator) {
                this.nodesContainer.removeChild(existingCoefIndicator);
            }
        }
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

    addControlButtons(node) {
        node.controlButtons = [];
        
        if (this.centers.includes(node)) {
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

    createAgendaText() {
        // Создаем контейнер для текста повестки
        this.agendaContainer = new PIXI.Container();
        this.agendaText = new PIXI.Text('Повестка', {
            fontFamily: 'Arial',
            fontSize: Math.min(72, window.innerHeight * 0.1),
            fill: 0x333333,
            align: 'center',
            wordWrap: true,
            wordWrapWidth: window.innerWidth * 0.8
        });
        this.agendaText.anchor.set(0.5);
        this.agendaText.x = this.app.screen.width / 2;
        this.agendaText.y = Math.min(100, window.innerHeight * 0.15);
        this.agendaContainer.addChild(this.agendaText);
        
        // Добавляем контейнер повестки первым, чтобы он был на заднем плане
        this.app.stage.addChildAt(this.agendaContainer, 0);
    }

    updateAgendaText(newText) {
        if (this.agendaText) {
            // Сохраняем текущие стили
            const currentStyle = this.agendaText.style;
            
            // Создаем новый текст с обновленным содержимым
            const newAgendaText = new PIXI.Text(newText, {
                fontFamily: currentStyle.fontFamily,
                fontSize: currentStyle.fontSize,
                fill: currentStyle.fill,
                align: currentStyle.align,
                wordWrap: currentStyle.wordWrap,
                wordWrapWidth: currentStyle.wordWrapWidth
            });
            
            // Копируем свойства из старого текста
            newAgendaText.anchor.set(0.5);
            newAgendaText.x = this.agendaText.x;
            newAgendaText.y = this.agendaText.y;
            
            // Заменяем старый текст новым в контейнере
            this.agendaContainer.removeChild(this.agendaText);
            this.agendaContainer.addChild(newAgendaText);
            this.agendaText = newAgendaText;
        }
    }

    createAddCenterButton() {
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
        
        saveButton.onclick = async () => {
            try {
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
                            distance: this.nodeDistances.get(node),
                            aspectId: node.aspect ? node.aspect.id : null
                        }))
                    })),
                    aspects: Array.from(this.aspects.entries()).map(([id, aspect]) => ({
                        id: id,
                        nodes: aspect.nodes.map(node => ({
                            centerId: this.centers.indexOf(this.nodeCenters.get(node)),
                            nodeIndex: this.nodeCenters.get(node).nodes.indexOf(node)
                        })),
                        x: aspect.x,
                        y: aspect.y
                    })),
                    agenda: this.agendaText ? this.agendaText.text : 'Повестка'
                };

                const jsonString = JSON.stringify(projectData, null, 2);
                const blob = new Blob([jsonString], { type: 'application/json' });

                if ('showSaveFilePicker' in window) {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: 'buoyancy_project.json',
                        types: [{
                            description: 'JSON файл',
                            accept: {
                                'application/json': ['.json']
                            }
                        }]
                    });
                    const writable = await handle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                } else {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'buoyancy_project.json';
                    a.style.display = 'none';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }
            } catch (error) {
                console.error('Ошибка при сохранении проекта:', error);
                alert('Ошибка при сохранении проекта. Попробуйте еще раз.');
            }
        };
        document.body.appendChild(saveButton);

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
        
        loadButton.onclick = () => {
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
        };
        document.body.appendChild(loadButton);

        const agendaButton = document.createElement('button');
        agendaButton.textContent = 'Повестка';
        agendaButton.style.position = 'absolute';
        agendaButton.style.top = '10px';
        agendaButton.style.left = (saveButton.offsetWidth + loadButton.offsetWidth + 40) + 'px';
        agendaButton.style.padding = '8px 16px';
        agendaButton.style.backgroundColor = '#333333';
        agendaButton.style.color = '#cccccc';
        agendaButton.style.border = '1px solid #666666';
        agendaButton.style.borderRadius = '4px';
        agendaButton.style.cursor = 'pointer';
        
        agendaButton.onclick = () => {
            const textInput = document.createElement('textarea');
            textInput.value = this.agendaText.text;
            textInput.style.position = 'absolute';
            textInput.style.backgroundColor = 'transparent';
            textInput.style.border = 'none';
            textInput.style.outline = 'none';
            textInput.style.color = '#ffffff';
            textInput.style.fontSize = Math.min(72, window.innerHeight * 0.1) + 'px';
            textInput.style.fontWeight = 'bold';
            textInput.style.textAlign = 'center';
            textInput.style.width = Math.min(window.innerWidth * 0.8, 1200) + 'px'; // Ограничиваем максимальную ширину
            textInput.style.height = 'auto';
            textInput.style.minHeight = Math.min(window.innerHeight * 0.2, 100) + 'px';
            textInput.style.maxHeight = '50vh'; // 50% от высоты viewport
            textInput.style.resize = 'none';
            textInput.style.overflow = 'auto';
            textInput.style.padding = '20px';
            textInput.style.margin = '0';
            textInput.style.fontFamily = 'Arial, sans-serif';
            textInput.style.zIndex = '1000';
            textInput.style.left = '50%';
            textInput.style.transform = 'translateX(-50%)'; // Центрирование по горизонтали
            textInput.style.top = Math.min(window.innerHeight * 0.1, 50) + 'px';
            
            // Добавляем контейнер для текстового поля
            const container = document.createElement('div');
            container.style.position = 'fixed';
            container.style.top = '0';
            container.style.left = '0';
            container.style.width = '100%';
            container.style.height = '100%';
            container.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            container.style.zIndex = '999';
            container.style.display = 'flex';
            container.style.alignItems = 'flex-start';
            container.style.justifyContent = 'center';
            container.style.paddingTop = Math.min(window.innerHeight * 0.1, 50) + 'px';
            container.style.overflow = 'auto';
            
            container.appendChild(textInput);
            document.body.appendChild(container);
            
            textInput.focus();
            textInput.select();
            
            let isEditingFinished = false;
            
            const finishEditing = () => {
                if (isEditingFinished) return;
                isEditingFinished = true;
                
                const newText = textInput.value.trim() || 'Повестка';
                this.updateAgendaText(newText);
                
                if (container.parentNode === document.body) {
                    document.body.removeChild(container);
                }
            };
            
            textInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    finishEditing();
                }
            });
            
            container.addEventListener('click', (e) => {
                if (e.target === container) {
                    finishEditing();
                }
            });
            
            textInput.addEventListener('blur', finishEditing);
            
            textInput.onclick = (e) => {
                e.stopPropagation();
            };
        };
        
        document.body.appendChild(agendaButton);

        const addCenterButton = document.createElement('button');
        addCenterButton.textContent = 'Добавить вариант';
        addCenterButton.style.position = 'absolute';
        addCenterButton.style.top = '10px';
        addCenterButton.style.left = (saveButton.offsetWidth + loadButton.offsetWidth + agendaButton.offsetWidth + 60) + 'px';
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

        const deleteCenterButton = document.createElement('button');
        deleteCenterButton.textContent = 'Удалить вариант';
        deleteCenterButton.style.position = 'absolute';
        deleteCenterButton.style.top = '10px';
        deleteCenterButton.style.left = (saveButton.offsetWidth + loadButton.offsetWidth + agendaButton.offsetWidth + addCenterButton.offsetWidth + 80) + 'px';
        deleteCenterButton.style.padding = '8px 16px';
        deleteCenterButton.style.backgroundColor = '#333333';
        deleteCenterButton.style.color = '#cccccc';
        deleteCenterButton.style.border = '1px solid #666666';
        deleteCenterButton.style.borderRadius = '4px';
        deleteCenterButton.style.cursor = 'pointer';
        deleteCenterButton.style.display = 'none';
        
        deleteCenterButton.onclick = () => {
            const selectedCenters = Array.from(this.selectedNodes).filter(node => this.centers.includes(node));
            if (selectedCenters.length > 0 && this.centers.length > selectedCenters.length) {
                for (const center of selectedCenters) {
                    const index = this.centers.indexOf(center);
                    if (index !== -1) {
                        for (const centerNode of center.nodes) {
                            this.nodesContainer.removeChild(centerNode.sprite);
                            this.linksContainer.removeChild(centerNode.link);
                        }
                        this.centersContainer.removeChild(center.sprite);
                        this.centers.splice(index, 1);
                    }
                }
                this.updateCentersPositions();
                this.selectedNodes.clear();
                this.updateSelection();
                deleteCenterButton.style.display = 'none';
            }
        };
        
        document.body.appendChild(deleteCenterButton);
        this.deleteCenterButton = deleteCenterButton;
        
        // Создаем текст повестки при инициализации
        this.createAgendaText();
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
                    distance: this.nodeDistances.get(node),
                    aspectId: node.aspect ? node.aspect.id : null
                }))
            })),
            aspects: Array.from(this.aspects.entries()).map(([id, aspect]) => ({
                id: id,
                nodes: aspect.nodes.map(node => ({
                    centerId: this.centers.indexOf(this.nodeCenters.get(node)),
                    nodeIndex: this.nodeCenters.get(node).nodes.indexOf(node)
                })),
                x: aspect.x,
                y: aspect.y
            })),
            agenda: this.agendaText ? this.agendaText.text : 'Повестка'
        };

        const jsonString = JSON.stringify(projectData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'buoyancy_project.json';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
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
        this.selectedNode = null;
        this.isDragging = false;
        this.draggedNode = null;
        
        // Очищаем существующие аспекты
        this.aspects.clear();
        
        // Создаем центры и узлы
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
            
            const centerNode = this.createNode(this.getColor(center.coef, true), center.label, center.coef, true);
            centerNode.x = center.x;
            centerNode.y = center.y;
            this.centersContainer.addChild(centerNode);
            center.sprite = centerNode;
            
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
        
        // Восстанавливаем аспекты, если они есть в данных
        if (projectData.aspects) {
            for (const aspectData of projectData.aspects) {
                const aspectNodes = aspectData.nodes.map(nodeRef => {
                    const center = this.centers[nodeRef.centerId];
                    return center.nodes[nodeRef.nodeIndex];
                });
                
                const aspect = {
                    id: aspectData.id,
                    nodes: aspectNodes,
                    isAspect: true,
                    isAnimating: false,
                    x: aspectData.x,
                    y: aspectData.y,
                    vx: 0,
                    vy: 0
                };
                
                this.aspects.set(aspectData.id, aspect);
                
                // Обновляем ссылки на аспект для каждого узла
                aspectNodes.forEach(node => {
                    node.isAspectNode = true;
                    node.aspect = aspect;
                    node.sprite.graphics.lineStyle(3, 0xffff00, 1);
                    node.sprite.graphics.drawRoundedRect(-node.sprite.width/2, -node.sprite.height/2, node.sprite.width, node.sprite.height, 10);
                });
            }
        }

        // Восстанавливаем повестку, если она есть в данных
        if (projectData.agenda) {
            this.updateAgendaText(projectData.agenda);
        } else {
            this.updateAgendaText('Повестка');
        }
        
        this.updateSelection();
        
        this.isDragging = false;
        this.draggedNode = null;
    }

    destroy() {
        console.log('Final memory report:', this.profiler.getReport());
        
        this.app.ticker.stop();
        
        window.removeEventListener('resize', this.handleResize);
        
        this.mainContainer.destroy({ children: true });
        this.textPool.forEach(text => text.destroy());
        this.textPool.clear();
        
        this.app.destroy(true, true);
        
        const memoryButton = document.querySelector('button[style*="position: absolute"]');
        if (memoryButton) {
            memoryButton.remove();
        }
    }

    // Добавляем новый метод для создания аспекта
    createAspect(nodes) {
        const aspectId = 'aspect_' + Date.now();
        
        // Сортируем узлы по их текущему положению
        const sortedNodes = [...nodes].sort((a, b) => {
            // Сначала сортируем по центру, к которому они привязаны
            const centerA = this.nodeCenters.get(a);
            const centerB = this.nodeCenters.get(b);
            if (centerA !== centerB) {
                return centerA.x - centerB.x;
            }
            // Если центры одинаковые, сортируем по x-координате
            return a.x - b.x;
        });
        
        const aspect = {
            id: aspectId,
            nodes: sortedNodes,
            isAspect: true,
            isAnimating: true,
            x: 0,
            y: 0,
            vx: 0,
            vy: 0
        };
        
        // Сохраняем аспект
        this.aspects.set(aspectId, aspect);
        
        // Вычисляем центр аспекта
        const targetX = sortedNodes.reduce((sum, node) => sum + node.x, 0) / sortedNodes.length;
        const targetY = sortedNodes.reduce((sum, node) => sum + node.y, 0) / sortedNodes.length;
        
        // Сохраняем начальные позиции
        const startPositions = sortedNodes.map(node => ({
            x: node.x,
            y: node.y,
            vx: node.vx,
            vy: node.vy
        }));
        
        // Отключаем физику для узлов аспекта
        sortedNodes.forEach(node => {
            node.vx = 0;
            node.vy = 0;
            node.isAspectNode = true;
            node.aspect = aspect;
        });
        
        let startTime = null;
        const duration = 1000;
        
        // Функция интерполяции
        const easeInOutCubic = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        
        // Вычисляем конечные позиции для горизонтального расположения
        let currentX = 0;
        const nodePositions = sortedNodes.map(node => {
            const width = node.sprite.width;
            const position = {
                x: currentX,
                width: width
            };
            currentX += width;
            return position;
        });
        
        const totalWidth = currentX;
        const startX = targetX - totalWidth / 2;
        
        // Анимируем перемещение всех узлов
        const animate = (currentTime) => {
            if (!startTime) startTime = currentTime;
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easeInOutCubic(progress);
            
            // Обновляем позиции всех узлов
            sortedNodes.forEach((node, index) => {
                const startPos = startPositions[index];
                const finalX = startX + nodePositions[index].x;
                node.x = startPos.x + (finalX - startPos.x) * easedProgress;
                node.y = startPos.y + (targetY - startPos.y) * easedProgress;
                
                // Обновляем связи
                const center = this.nodeCenters.get(node);
                const dxToCenter = node.x - center.x;
                const dyToCenter = node.y - center.y;
                const angle = Math.atan2(dyToCenter, dxToCenter);
                const distance = Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter);
                
                this.nodeAngles.set(node, angle);
                this.nodeDistances.set(node, distance);
            });
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                // Завершение анимации
                aspect.isAnimating = false;
                aspect.x = targetX;
                aspect.y = targetY;
                
                // Добавляем специальную рамку для аспекта
                sortedNodes.forEach(node => {
                    node.sprite.graphics.lineStyle(3, 0xffff00, 1);
                    node.sprite.graphics.drawRoundedRect(-node.sprite.width/2, -node.sprite.height/2, node.sprite.width, node.sprite.height, 10);
                });
            }
        };
        
        requestAnimationFrame(animate);
        return aspect;
    }

    // Обновляем метод splitAspect для восстановления физики
    splitAspect(aspectId) {
        const aspect = this.aspects.get(aspectId);
        if (aspect) {
            // Удаляем специальную рамку и флаг аспекта
            for (const node of aspect.nodes) {
                node.isAspectNode = false;
                node.aspect = null;
                node.sprite.graphics.clear();
                this.layoutNode(node.sprite, this.getColor(node.coef, false), node.label, node.coef);
                
                // Восстанавливаем физику для узла
                const center = this.nodeCenters.get(node);
                const dxToCenter = node.x - center.x;
                const dyToCenter = node.y - center.y;
                const angle = Math.atan2(dyToCenter, dxToCenter);
                const distance = Math.sqrt(dxToCenter * dxToCenter + dyToCenter * dyToCenter);
                
                this.nodeAngles.set(node, angle);
                this.nodeDistances.set(node, distance);
            }
            
            // Удаляем аспект
            this.aspects.delete(aspectId);
            
            // Очищаем выделение
            this.selectedNodes.clear();
        }
    }
}

// Запускаем симуляцию после загрузки страницы
window.addEventListener('load', () => {
    new BuoyancySimulation();
}); 
