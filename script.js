// Маппинг типов
const typeMap = {
    'know': 'Знать',
    'skill': 'Уметь',
    'practice': 'Иметь практический опыт',
    'both': 'Знать и уметь',
    'pk': 'ПК'
};

const levelOrder = ['Знать', 'Уметь', 'Иметь практический опыт', 'ПК'];
const levelYPositions = {};

let nodesData = [];
let linksData = [];
let pkData = {};
let svg, g;
let selectedNode = null;
let currentMdk = null;
let mdkData = {};
let pmData = {};
let showAllMdks = false; // Флаг для показа всех МДК
let mdkBoxes = {}; // Границы МДК: { [level]: { [mdkId]: { x, y, width, height } } }

// Размеры
const nodeWidth = 120;
const nodeHeight = 50;
const levelSpacing = 180;
const nodeSpacing = 50; // Увеличено расстояние между ДЕ одного уровня
const margin = { top: 80, right: 50, bottom: 50, left: 150 };
const mdkBoxPadding = 15; // Отступ внутри рамки МДК
const mdkBoxSpacing = 20; // Расстояние между рамками МДК
const mdkHeaderHeight = 30; // Высота заголовка МДК

let svgWidth = 0;
let svgHeight = 0;

// Инициализация SVG после загрузки d3
function initSVG(width, height) {
    if (typeof d3 === 'undefined') {
        console.error('d3.js не загружен');
        return false;
    }
    
    // Очищаем предыдущий SVG если есть
    d3.select('#svg-container').select('svg').remove();
    
    // Создание SVG с вычисленными размерами
    svg = d3.select('#svg-container')
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMinYMin meet')
        .style('display', 'block');
    
    // Определение стрелки
    svg.append('defs').append('marker')
        .attr('id', 'arrowhead')
        .attr('viewBox', '0 0 10 10')
        .attr('refX', 8)
        .attr('refY', 5)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')
        .attr('fill', '#666');
    
    // Создаем группу для трансформаций
    g = svg.append('g');
    
    // Настраиваем зум
    const zoom = d3.zoom()
        .scaleExtent([0.3, 3]) // Минимальный и максимальный масштаб
        .on('zoom', function(event) {
            g.attr('transform', event.transform);
        });
    
    svg.call(zoom);
    
    return true;
}

// Загрузка данных
async function loadData() {
    try {
        const response = await fetch('de_data.json');
        const data = await response.json();
        
        // Сохраняем структуру данных
        pmData = data;
        
        // Создаем карту МДК для быстрого доступа
        if (data.pms) {
            data.pms.forEach(pm => {
                pm.mdks.forEach(mdk => {
                    mdkData[mdk.id] = {
                        ...mdk,
                        pmId: pm.id,
                        pmLabel: pm.label,
                        pmTitle: pm.title
                    };
                });
            });
        }
        
        // Если есть дисциплины вне ПМ
        if (data.disciplines) {
            data.disciplines.forEach(discipline => {
                mdkData[discipline.id] = {
                    ...discipline,
                    pmId: null,
                    pmLabel: null,
                    pmTitle: null
                };
            });
        }
        
    // Заполняем селектор МДК
    populateMdkSelector();
    
    // По умолчанию загружаем все МДК
    loadAllMdks();
    const select = document.getElementById('mdkSelect');
    if (select) {
        select.value = 'all';
    }
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        alert('Не удалось загрузить данные из de_data.json');
    }
}

// Загрузка всех МДК с внешними связями
function loadAllMdks() {
    showAllMdks = true;
    currentMdk = null;
    nodesData = [];
    linksData = [];
    pkData = {};
    
    const allNodes = [];
    const allMdkIds = Object.keys(mdkData);
    
    // Сначала собираем информацию о ПК для определения пересечений
    const pkByLabel = {}; // { [label]: [{ mdkId, pk }] }
    
    allMdkIds.forEach(mdkId => {
        const mdk = mdkData[mdkId];
        if (mdk.pks) {
            mdk.pks.forEach(pk => {
                if (!pkByLabel[pk.label]) {
                    pkByLabel[pk.label] = [];
                }
                pkByLabel[pk.label].push({ mdkId, pk });
            });
        }
    });
    
    // Собираем все узлы из всех МДК
    allMdkIds.forEach(mdkId => {
        const mdk = mdkData[mdkId];
        
        // Добавляем ПК (только если они не относятся к нескольким МДК)
        if (mdk.pks) {
            mdk.pks.forEach(pk => {
                const pkOccurrences = pkByLabel[pk.label];
                // Если ПК относится только к одному МДК, добавляем его
                if (pkOccurrences.length === 1) {
                    pkData[`${mdkId}-${pk.id}`] = pk;
                    allNodes.push({
                        id: `pk-${mdkId}-${pk.id}`,
                        label: pk.label,
                        title: pk.title,
                        description: pk.description,
                        type: 'pk',
                        level: 'ПК',
                        pk: null,
                        mdkId: mdkId,
                        mdkLabel: mdk.label,
                        discipline: mdk.label,
                        isShared: false
                    });
                }
            });
        }
        
        // Добавляем ДЕ
        if (mdk.nodes) {
            mdk.nodes.forEach(node => {
                allNodes.push({
                    id: `de-${mdkId}-${node.id}`,
                    label: node.label,
                    title: node.title,
                    description: node.description,
                    type: node.type,
                    level: typeMap[node.type] || 'Знать', // Исправление: если тип не найден, используем 'Знать'
                    pk: node.pk,
                    mdkId: mdkId,
                    mdkLabel: mdk.label,
                    discipline: mdk.label,
                    originalId: node.id
                });
            });
        }
    });
    
    // Добавляем общие ПК (относящиеся к нескольким МДК) - размещаем их между рамками
    Object.keys(pkByLabel).forEach(pkLabel => {
        const occurrences = pkByLabel[pkLabel];
        if (occurrences.length > 1) {
            // ПК относится к нескольким МДК - создаем один узел
            const firstPk = occurrences[0].pk;
            const mdkIds = occurrences.map(o => o.mdkId);
            allNodes.push({
                id: `pk-shared-${pkLabel}`,
                label: pkLabel,
                title: firstPk.title,
                description: firstPk.description,
                type: 'pk',
                level: 'ПК',
                pk: null,
                mdkId: mdkIds.join(','), // Список МДК через запятую
                mdkLabel: mdkIds.map(id => mdkData[id].label).join(', '),
                discipline: mdkIds.map(id => mdkData[id].label).join(', '),
                isShared: true,
                sharedMdkIds: mdkIds
            });
        }
    });
    
    // Группируем узлы по МДК (все ДЕ и ПК одного МДК вместе)
    const nodesByMdk = {};
    allNodes.forEach(node => {
        // Для общих ПК используем первый МДК из списка
        const mdkId = node.isShared && node.sharedMdkIds ? node.sharedMdkIds[0] : node.mdkId;
        if (!nodesByMdk[mdkId]) {
            nodesByMdk[mdkId] = {
                de: [],
                pk: [],
                sharedPk: []
            };
        }
        if (node.type === 'pk') {
            if (node.isShared) {
                nodesByMdk[mdkId].sharedPk.push(node);
            } else {
                nodesByMdk[mdkId].pk.push(node);
            }
        } else {
            nodesByMdk[mdkId].de.push(node);
        }
    });
    
    // Группируем ДЕ внутри МДК по типам для вертикального расположения
    const deTypeOrder = ['Знать', 'Уметь', 'Иметь практический опыт'];
    const deTypeSpacing = 100; // Расстояние между типами ДЕ внутри МДК
    
    // Вычисляем размеры и позиции для каждого МДК
    mdkBoxes = {};
    let currentX = margin.left;
    let maxBoxHeight = 0;
    const mdkBoxPositions = {}; // Для размещения общих ПК
    
    Object.keys(nodesByMdk).forEach(mdkId => {
        const mdk = mdkData[mdkId];
        const mdkNodes = nodesByMdk[mdkId];
        
        // Группируем ДЕ по типам
        const deByType = {};
        deTypeOrder.forEach(type => {
            deByType[type] = [];
        });
        
        mdkNodes.de.forEach(node => {
            const type = node.level;
            if (deByType[type]) {
                deByType[type].push(node);
            }
        });
        
        // Вычисляем размеры рамки МДК
        // Ширина = максимальная ширина среди всех типов ДЕ
        let maxDeWidth = 0;
        deTypeOrder.forEach(type => {
            const deCount = deByType[type].length;
            if (deCount > 0) {
                const typeWidth = deCount * (nodeWidth + nodeSpacing) - nodeSpacing;
                if (typeWidth > maxDeWidth) {
                    maxDeWidth = typeWidth;
                }
            }
        });
        
        // Добавляем ПК в расчет ширины
        const pkCount = mdkNodes.pk.length;
        const pkWidth = pkCount > 0 ? pkCount * (nodeWidth + nodeSpacing) - nodeSpacing : 0;
        const totalWidth = Math.max(maxDeWidth, pkWidth) + mdkBoxPadding * 2;
        
        // Высота = сумма высот всех типов ДЕ + ПК + отступы
        let totalHeight = mdkHeaderHeight + mdkBoxPadding;
        deTypeOrder.forEach(type => {
            if (deByType[type].length > 0) {
                totalHeight += nodeHeight + deTypeSpacing;
            }
        });
        if (pkCount > 0) {
            totalHeight += nodeHeight + deTypeSpacing;
        }
        totalHeight += mdkBoxPadding;
        
        const boxX = currentX;
        const boxY = margin.top;
        const boxWidth = totalWidth;
        const boxHeight = totalHeight;
        
        mdkBoxPositions[mdkId] = { x: boxX, width: boxWidth };
        
        mdkBoxes[mdkId] = {
            x: boxX,
            y: boxY,
            width: boxWidth,
            height: boxHeight,
            mdk: mdk
        };
        
        // Размещаем узлы внутри рамки МДК
        let currentY = boxY + mdkHeaderHeight + mdkBoxPadding + nodeHeight / 2;
        
        // Размещаем ДЕ по типам вертикально
        deTypeOrder.forEach(type => {
            const deNodes = deByType[type];
            if (deNodes.length > 0) {
                const typeWidth = deNodes.length * (nodeWidth + nodeSpacing) - nodeSpacing;
                const startX = boxX + mdkBoxPadding + (boxWidth - mdkBoxPadding * 2 - typeWidth) / 2;
                
                deNodes.forEach((node, index) => {
                    node.x = startX + index * (nodeWidth + nodeSpacing) + nodeWidth / 2;
                    node.y = currentY;
                    nodesData.push(node);
                });
                
                currentY += nodeHeight + deTypeSpacing;
            }
        });
        
        // Размещаем ПК внизу рамки
        if (pkCount > 0) {
            const pkStartX = boxX + mdkBoxPadding + (boxWidth - mdkBoxPadding * 2 - pkWidth) / 2;
            mdkNodes.pk.forEach((node, index) => {
                node.x = pkStartX + index * (nodeWidth + nodeSpacing) + nodeWidth / 2;
                node.y = currentY;
                nodesData.push(node);
            });
        }
        
        currentX += boxWidth + mdkBoxSpacing;
        if (boxHeight > maxBoxHeight) {
            maxBoxHeight = boxHeight;
        }
    });
    
    // Размещаем общие ПК между рамками соответствующих МДК
    Object.keys(nodesByMdk).forEach(mdkId => {
        const sharedPks = nodesByMdk[mdkId].sharedPk;
        sharedPks.forEach(sharedPk => {
            if (sharedPk.sharedMdkIds && sharedPk.sharedMdkIds.length > 1) {
                const boxPositions = sharedPk.sharedMdkIds
                    .map(id => mdkBoxPositions[id])
                    .filter(p => p);
                
                if (boxPositions.length > 0) {
                    const firstBox = boxPositions[0];
                    const lastBox = boxPositions[boxPositions.length - 1];
                    const centerX = (firstBox.x + lastBox.x + lastBox.width) / 2;
                    
                    sharedPk.x = centerX;
                    sharedPk.y = margin.top + maxBoxHeight - nodeHeight / 2;
                    nodesData.push(sharedPk);
                }
            }
        });
    });
    
    // Вычисляем размеры SVG с запасом
    const allBoxes = Object.values(mdkBoxes);
    let maxRight = margin.left;
    let maxBottom = margin.top;
    
    allBoxes.forEach(box => {
        const rightEdge = box.x + box.width;
        const bottomEdge = box.y + box.height;
        if (rightEdge > maxRight) {
            maxRight = rightEdge;
        }
        if (bottomEdge > maxBottom) {
            maxBottom = bottomEdge;
        }
    });
    
    // Проверяем общие ПК
    nodesData.forEach(node => {
        if (node.isShared && node.x && node.y) {
            const rightEdge = node.x + nodeWidth / 2;
            const bottomEdge = node.y + nodeHeight / 2;
            if (rightEdge > maxRight) {
                maxRight = rightEdge;
            }
            if (bottomEdge > maxBottom) {
                maxBottom = bottomEdge;
            }
        }
    });
    
    svgWidth = Math.max(maxRight + margin.right + 200, 1200); // Добавляем большой запас справа
    svgHeight = Math.max(maxBottom + margin.bottom + 200, 800); // Добавляем большой запас снизу
    
    // Отладочная информация
    console.log('SVG размеры:', { 
        svgWidth, 
        svgHeight, 
        maxRight, 
        maxBottom, 
        maxBoxHeight,
        boxesCount: allBoxes.length 
    });
    
    // Инициализируем SVG с правильными размерами
    if (!initSVG(svgWidth, svgHeight)) {
        return;
    }
    
    // Добавляем внутренние связи из всех МДК
    allMdkIds.forEach(mdkId => {
        const mdk = mdkData[mdkId];
        if (mdk.edges) {
            mdk.edges.forEach(edge => {
                if (edge.type === 'agrees') return;
                
                const fromNode = nodesData.find(n => n.id === `de-${mdkId}-${edge.from}`);
                const toNode = nodesData.find(n => n.id === `de-${mdkId}-${edge.to}`);
                
                if (fromNode && toNode) {
                    linksData.push({
                        source: fromNode,
                        target: toNode,
                        type: edge.type,
                        isExternal: false
                    });
                }
            });
        }
        
        // Добавляем связи от ДЕ к ПК
        nodesData.forEach(node => {
            if (node.type === 'practice' && node.pk) {
                // Сначала ищем общий ПК (относящийся к нескольким МДК)
                let pkNode = nodesData.find(n => n.type === 'pk' && n.label === node.pk && n.isShared);
                
                // Если общий ПК не найден, ищем ПК в том же МДК
                if (!pkNode) {
                    pkNode = nodesData.find(n => n.type === 'pk' && n.label === node.pk && n.mdkId === node.mdkId);
                }
                
                if (pkNode) {
                    linksData.push({
                        source: node,
                        target: pkNode,
                        type: 'pk-connection',
                        isExternal: false
                    });
                }
            }
        });
        
        // Добавляем внешние связи
        if (mdk.externalEdges) {
            mdk.externalEdges.forEach(edge => {
                const fromNode = nodesData.find(n => n.id === `de-${mdkId}-${edge.from}`);
                const targetMdk = mdkData[edge.to.mdk];
                
                if (fromNode && targetMdk) {
                    const targetNode = nodesData.find(n => n.id === `de-${edge.to.mdk}-${edge.to.node}`);
                    if (targetNode) {
                        linksData.push({
                            source: fromNode,
                            target: targetNode,
                            type: edge.type,
                            isExternal: true,
                            externalMdk: edge.to.mdk,
                            externalNodeId: edge.to.node
                        });
                    }
                }
            });
        }
    });
    
    // Обновляем заголовок
    updateHeader();
    
    // Рисуем схему
    drawDiagram();
}

// Загрузка конкретного МДК
function loadMdk(mdkId) {
    showAllMdks = false;
    const mdk = mdkData[mdkId];
    if (!mdk) {
        console.error(`МДК ${mdkId} не найден`);
        return;
    }
    
    currentMdk = mdk;
    nodesData = [];
    linksData = [];
    pkData = {};
    
    // Сохраняем данные о ПК
    if (mdk.pks) {
        mdk.pks.forEach(pk => {
            pkData[pk.id] = pk;
        });
    }
    
    // Подготавливаем узлы
    const allNodes = [];
    
    // Добавляем ПК
    if (mdk.pks) {
        mdk.pks.forEach((pk, index) => {
            allNodes.push({
                id: pk.id,
                label: pk.label,
                title: pk.title,
                description: pk.description,
                type: 'pk',
                level: 'ПК',
                pk: null,
                mdkId: mdkId,
                mdkLabel: mdk.label,
                discipline: mdk.label
            });
        });
    }
    
    // Добавляем ДЕ
    if (mdk.nodes) {
        mdk.nodes.forEach(node => {
            const nodeLevel = typeMap[node.type] || 'Знать'; // Исправление: если тип не найден, используем 'Знать'
            allNodes.push({
                id: `de-${mdkId}-${node.id}`,
                label: node.label,
                title: node.title,
                description: node.description,
                type: node.type,
                level: nodeLevel,
                pk: node.pk,
                mdkId: mdkId,
                mdkLabel: mdk.label,
                discipline: mdk.label,
                originalId: node.id
            });
        });
    }
    
    // Группируем по уровням
    const nodesByLevel = {};
    levelOrder.forEach(level => {
        nodesByLevel[level] = [];
    });
    
    allNodes.forEach(node => {
        const level = node.level;
        if (nodesByLevel[level]) {
            nodesByLevel[level].push(node);
        } else {
            // Если уровень не найден, добавляем в первый доступный
            console.warn(`Узел ${node.id} имеет неизвестный уровень: ${level}, добавляем в 'Знать'`);
            if (nodesByLevel['Знать']) {
                nodesByLevel['Знать'].push(node);
            }
        }
    });
    
    // Вычисляем позиции для каждого уровня
    let currentY = margin.top;
    levelOrder.forEach((level, levelIndex) => {
        levelYPositions[level] = currentY;
        currentY += levelSpacing;
    });
    
    // Вычисляем максимальную ширину для всех уровней
    let maxLevelWidth = 0;
    levelOrder.forEach(level => {
        const nodes = nodesByLevel[level];
        if (nodes.length > 0) {
            const levelWidth = nodes.length * (nodeWidth + nodeSpacing) - nodeSpacing;
            if (levelWidth > maxLevelWidth) {
                maxLevelWidth = levelWidth;
            }
        }
    });
    
    // Вычисляем размеры SVG
    svgWidth = Math.max(maxLevelWidth + margin.left + margin.right, 1200);
    svgHeight = currentY + nodeHeight + margin.bottom;
    
    // Инициализируем SVG с правильными размерами
    if (!initSVG(svgWidth, svgHeight)) {
        return;
    }
    
    // Вычисляем позиции узлов
    levelOrder.forEach(level => {
        const nodes = nodesByLevel[level];
        if (nodes.length === 0) return;
        
        const totalWidth = nodes.length * (nodeWidth + nodeSpacing) - nodeSpacing;
        const startX = margin.left + (svgWidth - margin.left - margin.right - totalWidth) / 2;
        
        nodes.forEach((node, index) => {
            node.x = startX + index * (nodeWidth + nodeSpacing) + nodeWidth / 2;
            node.y = levelYPositions[level] + nodeHeight / 2;
            nodesData.push(node);
        });
    });
    
    // Подготавливаем внутренние связи (исключаем тип "agrees")
    if (mdk.edges) {
        mdk.edges.forEach(edge => {
            // Пропускаем связи типа "agrees"
            if (edge.type === 'agrees') return;
            
            const fromNode = nodesData.find(n => n.id === `de-${mdkId}-${edge.from}`);
            const toNode = nodesData.find(n => n.id === `de-${mdkId}-${edge.to}`);
            
            if (fromNode && toNode) {
                linksData.push({
                    source: fromNode,
                    target: toNode,
                    type: edge.type,
                    isExternal: false
                });
            }
        });
    }
    
        // Добавляем связи от ДЕ к ПК (только для "Иметь практический опыт")
    nodesData.forEach(node => {
        if (node.type === 'practice' && node.pk && node.mdkId === mdkId) {
            // Ищем ПК по label в том же МДК
            const pkNode = nodesData.find(n => n.type === 'pk' && n.label === node.pk && n.mdkId === mdkId);
            if (pkNode) {
                linksData.push({
                    source: node,
                    target: pkNode,
                    type: 'pk-connection',
                    isExternal: false
                });
            }
        }
    });
    
    // Добавляем внешние связи
    if (mdk.externalEdges) {
        mdk.externalEdges.forEach(edge => {
            const fromNode = nodesData.find(n => n.id === `de-${mdkId}-${edge.from}`);
            const targetMdk = mdkData[edge.to.mdk];
            
            if (fromNode && targetMdk) {
                // Находим целевую ДЕ в другом МДК
                const targetNode = targetMdk.nodes.find(n => n.id === edge.to.node);
                if (targetNode) {
                    // Создаем виртуальный узел для внешней связи (будет показан как ссылка)
                    const externalNodeId = `external-${edge.to.mdk}-${edge.to.node}`;
                    let externalNode = nodesData.find(n => n.id === externalNodeId);
                    
                    if (!externalNode) {
                        externalNode = {
                            id: externalNodeId,
                            label: targetNode.label,
                            title: targetNode.title,
                            description: targetNode.description,
                            type: targetNode.type,
                            level: typeMap[targetNode.type],
                            pk: targetNode.pk,
                            mdkId: edge.to.mdk,
                            mdkLabel: targetMdk.label,
                            discipline: targetMdk.label,
                            originalId: targetNode.id,
                            isExternal: true
                        };
                        nodesData.push(externalNode);
                        
                        // Размещаем внешние узлы справа от источника
                        const externalX = fromNode.x + nodeWidth + 20;
                        externalNode.x = externalX;
                        externalNode.y = fromNode.y; // На том же уровне что и источник
                        
                        // Если внешний узел выходит за границы, размещаем его справа от схемы
                        if (externalX + nodeWidth / 2 > svgWidth - margin.right) {
                            externalNode.x = svgWidth - margin.right - nodeWidth / 2;
                        }
                    }
                    
                    linksData.push({
                        source: fromNode,
                        target: externalNode,
                        type: edge.type,
                        isExternal: true,
                        externalMdk: edge.to.mdk,
                        externalNodeId: edge.to.node
                    });
                }
            }
        });
    }
    
    // Обновляем заголовок
    updateHeader();
    
    // Рисуем схему
    drawDiagram();
}

function drawDiagram() {
    // Очищаем предыдущее содержимое
    g.selectAll('*').remove();
    
    // Рисуем рамки МДК (если показываем все МДК) - ПЕРЕД связями
    if (showAllMdks && mdkBoxes) {
        Object.keys(mdkBoxes).forEach(mdkId => {
            const box = mdkBoxes[mdkId];
            if (!box) return;
            
            // Рисуем прямоугольник рамки
            const boxGroup = g.append('g')
                .attr('class', 'mdk-box-group')
                .lower(); // Размещаем под узлами
            
            boxGroup.append('rect')
                .attr('class', 'mdk-box')
                .attr('x', box.x)
                .attr('y', box.y)
                .attr('width', box.width)
                .attr('height', box.height)
                .attr('rx', 4);
            
            // Добавляем заголовок МДК
            boxGroup.append('text')
                .attr('class', 'mdk-box-title')
                .attr('x', box.x + box.width / 2)
                .attr('y', box.y + mdkHeaderHeight / 2 + 5)
                .attr('text-anchor', 'middle')
                .text(box.mdk.label);
        });
    }
    
    // Рисуем связи ПЕРВЫМИ (чтобы они были под блоками)
    // Показываем только связи между ДЕ и связи от practice к ПК
    const visibleLinks = linksData.filter(d => {
        // Исключаем связи типа 'pk-connection', кроме связей от practice к ПК
        if (d.type === 'pk-connection') {
            return d.source.type === 'practice';
        }
        return true;
    });
    const links = g.selectAll('.link-group')
        .data(visibleLinks)
        .enter()
        .append('g')
        .attr('class', 'link-group')
        .lower(); // Перемещаем вниз по z-order
    
    const linkPaths = links.append('path')
        .attr('class', d => {
            let linkClass = 'link';
            if (d.isExternal) linkClass += ' external-link';
            if (d.type === 'base') return linkClass + ' link-base';
            if (d.type === 'develops') return linkClass + ' link-develops';
            if (d.type === 'agrees') return linkClass + ' link-agrees';
            if (d.type === 'pk-connection') return linkClass + ' link-pk';
            return linkClass;
        })
        .attr('d', d => {
            // Стрелки начинаются от нижнего края блока источника (с небольшим отступом)
            const sourceY = d.source.y + nodeHeight / 2 + 2;
            // Стрелки заканчиваются у верхнего края блока цели (с небольшим отступом, чтобы не перекрывать блок)
            const targetY = d.target.y - nodeHeight / 2 - 2;
            const midY = (sourceY + targetY) / 2;
            const dx = Math.abs(d.target.x - d.source.x);
            const dy = Math.abs(targetY - sourceY);
            
            // Если элементы на одном уровне (горизонтальная связь)
            if (dy < 20) {
                // Горизонтальная линия с изгибом вверх (под блоками)
                const offsetY = Math.min(sourceY, targetY) - 30;
                return `M ${d.source.x} ${sourceY}
                        L ${d.source.x} ${offsetY}
                        L ${d.target.x} ${offsetY}
                        L ${d.target.x} ${targetY}`;
            } else {
                // Вертикально-горизонтальная линия
                // Стрелка идет от нижнего края источника, затем горизонтально, затем к верхнему краю цели
                return `M ${d.source.x} ${sourceY}
                        L ${d.source.x} ${midY}
                        L ${d.target.x} ${midY}
                        L ${d.target.x} ${targetY}`;
            }
        });
    
    // Рисуем узлы ПОСЛЕ связей (чтобы они были поверх стрелок)
    const nodes = g.selectAll('.node')
        .data(nodesData)
        .enter()
        .append('g')
        .attr('class', 'node')
        .attr('transform', d => `translate(${d.x},${d.y})`)
        .raise() // Перемещаем вверх по z-order (поверх связей)
        .on('click', (event, d) => {
            event.stopPropagation();
            // Один клик - только подсветка
            highlightNode(d);
        })
        .on('dblclick', (event, d) => {
            event.stopPropagation();
            // Двойной клик - открытие модального окна
            showInfo(d);
        });
    
    // Прямоугольники для узлов
    const rects = nodes.append('rect')
        .attr('class', d => {
            let baseClass = 'node-rect';
            if (d.isExternal) baseClass += ' external';
            if (d.type === 'know') return baseClass + ' de-know';
            if (d.type === 'skill') return baseClass + ' de-skill';
            if (d.type === 'practice') return baseClass + ' de-practice';
            if (d.type === 'pk') return baseClass + ' de-pk';
            return baseClass;
        })
        .attr('width', nodeWidth)
        .attr('height', nodeHeight)
        .attr('x', -nodeWidth / 2)
        .attr('y', -nodeHeight / 2);
    
    // Добавляем подсказку при наведении на узлы
    rects.append('title')
        .text(d => {
            if (d.isExternal) {
                return `${d.label} (${d.mdkLabel}): ${d.title}`;
            }
            return `${d.label}: ${d.title}`;
        });
    
    // Текст в узлах
    nodes.append('text')
        .attr('class', 'node-text')
        .attr('dy', '0.35em')
        .attr('fill', d => {
            // Белый текст для цветных блоков
            if (d.type === 'know' || d.type === 'skill' || d.type === 'practice' || d.type === 'pk') {
                return 'white';
            }
            return '#333';
        })
        .text(d => d.label);
    
    // Обработчик клика вне узлов для сброса подсветки
    // Используем более точную проверку, чтобы не конфликтовать с зумом
    g.on('click', function(event) {
        // Проверяем, что клик был не по узлу
        if (event.target.classList.contains('node-rect') || 
            event.target.classList.contains('node-text') ||
            event.target.closest('.node')) {
            return;
        }
        resetHighlight();
        selectedNode = null;
    });
    
    // Обновляем размер SVG если нужно - проверяем все элементы
    let maxX = svgWidth;
    let maxY = svgHeight;
    
    // Проверяем узлы
    nodesData.forEach(node => {
        if (node.x && node.y) {
            const nodeRight = node.x + nodeWidth / 2;
            const nodeBottom = node.y + nodeHeight / 2;
            if (nodeRight > maxX) maxX = nodeRight;
            if (nodeBottom > maxY) maxY = nodeBottom;
        }
    });
    
    // Проверяем рамки МДК
    if (showAllMdks && mdkBoxes) {
        Object.values(mdkBoxes).forEach(box => {
            const boxRight = box.x + box.width;
            const boxBottom = box.y + box.height;
            if (boxRight > maxX) maxX = boxRight;
            if (boxBottom > maxY) maxY = boxBottom;
        });
    }
    
    // Добавляем отступы
    maxX += margin.right + 50;
    maxY += margin.bottom + 100;
    
    // Обновляем размеры если нужно
    if (maxX > svgWidth || maxY > svgHeight) {
        svgWidth = Math.max(maxX, svgWidth);
        svgHeight = Math.max(maxY, svgHeight);
        svg.attr('width', svgWidth)
           .attr('height', svgHeight)
           .attr('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
    }
}

function highlightNode(node) {
    selectedNode = node;
    
    // Находим все связанные узлы
    const connectedNodeIds = new Set();
    connectedNodeIds.add(node.id);
    
    // Если выделен ПК, находим только напрямую связанные practice ДЕ
    if (node.type === 'pk') {
        // Находим только practice ДЕ, которые напрямую связаны с этим ПК
        linksData.forEach(link => {
            if (link.type === 'pk-connection' && link.target.id === node.id && !link.isExternal) {
                // Добавляем только сам practice ДЕ, без поиска всех связанных с ним ДЕ
                connectedNodeIds.add(link.source.id);
            }
        });
    } else {
        // Для обычных ДЕ находим связи, связанные с выбранным узлом
        linksData.forEach(link => {
            if (link.source.id === node.id || link.target.id === node.id) {
                connectedNodeIds.add(link.source.id);
                connectedNodeIds.add(link.target.id);
            }
        });
        
        // Если выделена ДЕ, также выделяем связанный ПК (из того же МДК)
        if (node.pk) {
            const pkNode = nodesData.find(n => n.type === 'pk' && n.label === node.pk && n.mdkId === node.mdkId);
            if (pkNode) {
                connectedNodeIds.add(pkNode.id);
            }
        }
        
        // Находим все practice ДЕ среди связанных узлов и добавляем их ПК
        const practiceNodes = [];
        connectedNodeIds.forEach(nodeId => {
            const connectedNode = nodesData.find(n => n.id === nodeId);
            if (connectedNode && connectedNode.type === 'practice' && connectedNode.pk) {
                practiceNodes.push(connectedNode);
            }
        });
        
        // Добавляем ПК для всех найденных practice ДЕ
        practiceNodes.forEach(practiceNode => {
            const pkNode = nodesData.find(n => n.type === 'pk' && n.label === practiceNode.pk && n.mdkId === practiceNode.mdkId);
            if (pkNode) {
                connectedNodeIds.add(pkNode.id);
            }
        });
    }
    
    // Обновляем визуализацию
    g.selectAll('.node').each(function(d) {
        const nodeGroup = d3.select(this);
        const rect = nodeGroup.select('.node-rect');
        const text = nodeGroup.select('.node-text');
        
        if (connectedNodeIds.has(d.id)) {
            if (d.id === node.id) {
                rect.classed('highlighted', true).classed('dimmed', false);
            } else {
                rect.classed('highlighted', true).classed('dimmed', false);
            }
            text.classed('dimmed', false);
        } else {
            rect.classed('highlighted', false).classed('dimmed', true);
            text.classed('dimmed', true);
        }
    });
    
    // Обновляем связи
    g.selectAll('.link-group').each(function(d) {
        const linkGroup = d3.select(this);
        const path = linkGroup.select('path');
        
        if (connectedNodeIds.has(d.source.id) && connectedNodeIds.has(d.target.id)) {
            // Выделенная связь - поднимаем наверх и делаем ярче
            path.classed('highlighted', true).classed('dimmed', false);
            linkGroup.raise(); // Поднимаем выделенные связи поверх других
        } else {
            // Невыделенная связь - затемняем
            path.classed('highlighted', false).classed('dimmed', true);
        }
    });
    
    // Узлы всегда должны быть поверх всех связей
    g.selectAll('.node').raise();
}

function resetHighlight() {
    if (!g) return;
    
    g.selectAll('.node-rect')
        .classed('highlighted', false)
        .classed('dimmed', false);
    
    g.selectAll('.node-text')
        .classed('dimmed', false);
    
    g.selectAll('.link-group path')
        .classed('highlighted', false)
        .classed('dimmed', false);
    
    selectedNode = null;
}

// Делаем функцию доступной глобально для кнопки
window.resetHighlight = resetHighlight;

// Заполнение селектора МДК
function populateMdkSelector() {
    const select = document.getElementById('mdkSelect');
    if (!select) return;
    
    select.innerHTML = '';
    
    // Добавляем опцию "Все МДК"
    const allOption = document.createElement('option');
    allOption.value = 'all';
    allOption.textContent = 'Все МДК (полная схема с внешними связями)';
    select.appendChild(allOption);
    
    // Добавляем МДК из ПМ
    if (pmData.pms) {
        pmData.pms.forEach(pm => {
            const optgroup = document.createElement('optgroup');
            optgroup.label = `${pm.label} - ${pm.title}`;
            
            pm.mdks.forEach(mdk => {
                const option = document.createElement('option');
                option.value = mdk.id;
                option.textContent = `${mdk.label} - ${mdk.title}`;
                optgroup.appendChild(option);
            });
            
            select.appendChild(optgroup);
        });
    }
    
    // Добавляем дисциплины вне ПМ
    if (pmData.disciplines && pmData.disciplines.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = 'Дисциплины вне ПМ';
        
        pmData.disciplines.forEach(discipline => {
            const option = document.createElement('option');
            option.value = discipline.id;
            option.textContent = `${discipline.label} - ${discipline.title}`;
            optgroup.appendChild(option);
        });
        
        select.appendChild(optgroup);
    }
    
    // Добавляем обработчик изменения
    select.addEventListener('change', function() {
        const selectedMdkId = this.value;
        if (selectedMdkId === 'all') {
            loadAllMdks();
        } else if (selectedMdkId) {
            loadMdk(selectedMdkId);
        }
    });
}

// Обновление заголовка
function updateHeader() {
    const headerTitle = document.getElementById('headerTitle');
    if (headerTitle) {
        if (showAllMdks) {
            headerTitle.textContent = 'Полная схема всех МДК с внешними связями';
        } else if (currentMdk) {
            let title = currentMdk.label;
            if (currentMdk.pmLabel) {
                title = `${currentMdk.pmLabel} → ${currentMdk.label}`;
            }
            if (currentMdk.title) {
                title += ` - ${currentMdk.title}`;
            }
            headerTitle.textContent = title;
        }
    }
}

function showInfo(data) {
    const modal = document.getElementById('infoModal');
    const modalBody = document.getElementById('modalBody');
    
    let html = '';
    
    if (data.type === 'pk') {
        // Находим все ДЕ типа "practice", связанные с этим ПК (из того же МДК)
        const relatedDEs = nodesData.filter(n => n.pk === data.label && n.type === 'practice' && n.mdkId === data.mdkId);
        
        html = `
            <h2>${data.label}</h2>
            <div class="info-section">
                <p>
                    <span class="badge badge-pk">${data.label}</span>
                    <span class="badge badge-mdk">${data.mdkLabel || data.discipline || 'Неизвестно'}</span>
                </p>
            </div>
            <div class="info-section">
                <h3>Название:</h3>
                <p><strong>${data.title}</strong></p>
            </div>
            <div class="info-section">
                <h3>Описание:</h3>
                <p>${data.description}</p>
            </div>
            <div class="info-section">
                <h3>Связанные дидактические единицы (${relatedDEs.length}):</h3>
                <ul class="connections-list">
                    ${relatedDEs.map(de => `<li>${de.label}: ${de.title}</li>`).join('')}
                </ul>
            </div>
        `;
    } else {
        const typeClass = data.type === 'know' ? 'know' : 
                         data.type === 'skill' ? 'skill' : 
                         data.type === 'practice' ? 'practice' : 'both';
        
        // Находим все связи для этого ДЕ (включая внешние)
        const incomingLinks = linksData.filter(l => l.target.id === data.id && l.type !== 'pk-connection');
        const outgoingLinks = linksData.filter(l => l.source.id === data.id && l.type !== 'pk-connection');
        
        // Функция для определения дисциплины узла
        const getDiscipline = (node) => {
            // Используем поле discipline из узла
            return node.discipline || node.mdkLabel || 'Неизвестно';
        };
        
        // Формируем списки с полной информацией о ДЕ
        const baseFor = outgoingLinks
            .filter(l => l.type === 'base')
            .map(l => {
                return {
                    node: l.target,
                    discipline: getDiscipline(l.target)
                };
            });
        
        const develops = outgoingLinks
            .filter(l => l.type === 'develops')
            .map(l => {
                return {
                    node: l.target,
                    discipline: getDiscipline(l.target)
                };
            });
        
        const reliesOn = incomingLinks
            .filter(l => l.type === 'base')
            .map(l => {
                return {
                    node: l.source,
                    discipline: getDiscipline(l.source)
                };
            });
        
        // Функция для создания элемента списка связи
        const createConnectionItem = (item) => {
            const nodeType = typeMap[item.node.type] || item.node.type;
            return `<li class="connection-item">
                <span class="connection-type-label">${nodeType}:</span>
                <span class="connection-title">${item.node.title}</span>
                <span class="connection-discipline">(${item.discipline})</span>
            </li>`;
        };
        
        html = `
            <h2>${data.label}</h2>
            <div class="info-section">
                <p>
                    <span class="badge badge-${typeClass}">${typeMap[data.type]}</span>
                    <span class="badge badge-pk">${data.pk}</span>
                    <span class="badge badge-mdk">${data.mdkLabel || data.discipline || 'Неизвестно'}</span>
                </p>
            </div>
            <div class="info-section">
                <h3>Название:</h3>
                <p><strong>${data.title}</strong></p>
            </div>
            <div class="info-section">
                <h3>Описание:</h3>
                <p>${data.description}</p>
            </div>
            <div class="info-section">
                <h3>Связи с другими ДЕ:</h3>
                ${reliesOn.length > 0 ? `
                    <div class="connection-group">
                        <strong>Опирается на:</strong>
                        <ul class="connections-list">
                            ${reliesOn.map(item => createConnectionItem(item)).join('')}
                        </ul>
                    </div>
                ` : ''}
                ${baseFor.length > 0 ? `
                    <div class="connection-group">
                        <strong>База для:</strong>
                        <ul class="connections-list">
                            ${baseFor.map(item => createConnectionItem(item)).join('')}
                        </ul>
                    </div>
                ` : ''}
                ${develops.length > 0 ? `
                    <div class="connection-group">
                        <strong>Развивает:</strong>
                        <ul class="connections-list">
                            ${develops.map(item => createConnectionItem(item)).join('')}
                        </ul>
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    modalBody.innerHTML = html;
    modal.style.display = 'block';
}

// Закрытие модального окна
const modal = document.getElementById('infoModal');
const closeBtn = document.getElementsByClassName('close')[0];

closeBtn.onclick = function() {
    modal.style.display = 'none';
    resetHighlight();
    selectedNode = null;
};

window.onclick = function(event) {
    if (event.target === modal) {
        modal.style.display = 'none';
        resetHighlight();
        selectedNode = null;
    }
};

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        modal.style.display = 'none';
        resetHighlight();
        selectedNode = null;
    }
});

// Загружаем данные при загрузке страницы
window.addEventListener('DOMContentLoaded', function() {
    // Проверяем загрузку d3.js
    if (typeof d3 === 'undefined') {
        // Пробуем альтернативный CDN
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/d3@7/dist/d3.min.js';
        script.onload = function() {
            loadData();
        };
        script.onerror = function() {
            alert('Не удалось загрузить библиотеку d3.js. Проверьте подключение к интернету.');
        };
        document.head.appendChild(script);
    } else {
        loadData();
    }
});

