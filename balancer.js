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
        
        this.app.stage.on('pointerdown', (e) => {
            const pos = e.getLocalPosition(this.mainContainer);
            let clickedNode = null;
            
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

            if (this.selectedNode && !this.centers.includes(this.selectedNode)) {
                if (e.key === 'ArrowUp') {
                    this.selectedNode.coef = Math.min(5, this.selectedNode.coef + 1);
                    this.updateNode(this.selectedNode.sprite, this.getColor(this.selectedNode.coef, false), this.selectedNode.label, this.selectedNode.coef);
                    this.selectedNode.sprite.graphics.lineStyle(3, 0xffffff, 1);
                    this.selectedNode.sprite.graphics.drawRoundedRect(-this.selectedNode.sprite.width/2, -this.selectedNode.sprite.height/2, this.selectedNode.sprite.width, this.selectedNode.sprite.height, 10);
                    
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
                    this.selectedNode.coef = Math.max(-5, this.selectedNode.coef - 1);
                    this.updateNode(this.selectedNode.sprite, this.getColor(this.selectedNode.coef, false), this.selectedNode.label, this.selectedNode.coef);
                    this.selectedNode.sprite.graphics.lineStyle(3, 0xffffff, 1);
                    this.selectedNode.sprite.graphics.drawRoundedRect(-this.selectedNode.sprite.width/2, -this.selectedNode.sprite.height/2, this.selectedNode.sprite.width, this.selectedNode.sprite.height, 10);
                    
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

    isPointInNode(point, node) {
        const dx = point.x - node.x;
        const dy = point.y - node.y;
        const width = node.width || this.nodeRadius * 2;
        const height = node.height || 70;
        return Math.abs(dx) < width/2 && Math.abs(dy) < height/2;
    }

    startTextEditing(node) {
        // Проверяем, не открыта ли уже панель редактирования
        const existingPanel = document.querySelector('div[style*="position: absolute"][style*="z-index: 1000"]');
        if (existingPanel) {
            document.body.removeChild(existingPanel);
        }

        const isCenter = this.centers.includes(node);
        const container = isCenter ? this.centersContainer : this.nodesContainer;
        
        // Создаем панель редактирования
        const panel = document.createElement('div');
        panel.style.position = 'absolute';
        panel.style.top = '50px';
        panel.style.left = '50%';
        panel.style.transform = 'translateX(-50%)';
        panel.style.zIndex = '1000';
        
        // Создаем текстовое поле
        const textarea = document.createElement('textarea');
        textarea.value = node.label;
        textarea.style.width = '300px';
        textarea.style.height = '100px';
        textarea.style.padding = '8px';
        textarea.style.backgroundColor = '#222222';
        textarea.style.color = '#ffffff';
        textarea.style.border = '1px solid #666666';
        textarea.style.borderRadius = '4px';
        textarea.style.resize = 'none';
        textarea.style.fontSize = '16px';
        textarea.style.fontFamily = 'Arial, sans-serif';
        textarea.style.outline = 'none';
        panel.appendChild(textarea);
        
        // Добавляем панель на страницу
        document.body.appendChild(panel);
        
        // Фокусируемся на текстовом поле и выделяем весь текст
        textarea.focus();
        textarea.select();
        
        // Обработчики событий
        const closePanel = () => {
            if (panel.parentNode === document.body) {
                const newLabel = textarea.value.trim();
                if (newLabel) {
                    node.label = newLabel;
                    this.updateNode(node.sprite, this.getColor(node.coef, isCenter), newLabel, node.coef);
                    if (isCenter) {
                        this.updateCentersPositions();
                    }
                }
                document.body.removeChild(panel);
            }
        };
        
        // Закрываем панель при клике вне её
        const clickOutsideHandler = (e) => {
            if (!panel.contains(e.target)) {
                closePanel();
                document.removeEventListener('click', clickOutsideHandler);
            }
        };
        
        // Добавляем небольшую задержку перед добавлением обработчика клика
        setTimeout(() => {
            document.addEventListener('click', clickOutsideHandler);
        }, 100);
        
        // Предотвращаем закрытие при клике на панель
        panel.onclick = (e) => {
            e.stopPropagation();
        };
    }

    updateSelection() {
        for (const center of this.centers) {
            center.nodes.sort((a, b) => b.zIndex - a.zIndex);
            
            center.sprite.zIndex = center.zIndex;
            this.layoutNode(center.sprite, this.getColor(center.coef, true), center.label, center.coef);
            
            center.nodes.forEach(node => {
                if (node !== this.selectedNode) {
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

        if (this.selectedNode) {
            const selectedSprite = this.selectedNode.sprite;
            const currentZIndex = this.selectedNode.zIndex;
            this.selectedNode.zIndex = 1000;
            selectedSprite.zIndex = 1000;
            
            const container = selectedSprite.parent;
            if (container) {
                container.removeChild(selectedSprite);
                container.addChild(selectedSprite);
            }
            
            selectedSprite.graphics.lineStyle(3, 0xffffff, 1);
            selectedSprite.graphics.drawRoundedRect(-selectedSprite.width/2, -selectedSprite.height/2, selectedSprite.width, selectedSprite.height, 10);
            
            const coefIndicator = this.createCoefIndicator(this.selectedNode.coef);
            coefIndicator.x = this.app.screen.width - 100;
            coefIndicator.y = 50;
            coefIndicator.coefIndicator = true;
            this.nodesContainer.addChild(coefIndicator);

            if (!this.centers.includes(this.selectedNode)) {
                const plusBtn = this.createSmallStyledButton('За', this.app.screen.width - 180, 50, () => {
                    this.selectedNode.coef = Math.min(5, this.selectedNode.coef + 1);
                    this.updateNode(this.selectedNode.sprite, this.getColor(this.selectedNode.coef, false), this.selectedNode.label, this.selectedNode.coef);
                    this.selectedNode.sprite.graphics.lineStyle(3, 0xffffff, 1);
                    this.selectedNode.sprite.graphics.drawRoundedRect(-this.selectedNode.sprite.width/2, -this.selectedNode.sprite.height/2, this.selectedNode.sprite.width, this.selectedNode.sprite.height, 10);
                    
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
            
            if (this.deleteCenterButton) {
                this.deleteCenterButton.style.display = this.centers.includes(this.selectedNode) ? 'block' : 'none';
            }
            
            this.addControlButtons(this.selectedNode);
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
        
        saveButton.onclick = () => this.saveToJson();
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
        
        loadButton.onclick = () => this.loadFromJson();
        document.body.appendChild(loadButton);

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
        deleteCenterButton.style.display = 'none';
        
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
}

// Запускаем симуляцию после загрузки страницы
window.addEventListener('load', () => {
    new BuoyancySimulation();
}); 
