// Formatter utilities
function formatBytes(bits) {
    if (isNaN(bits) || bits === Infinity) return '--';
    const bytes = bits / 8;
    if (bytes >= 1024 * 1024 * 1024) return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GiB';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MiB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KiB';
    return bytes.toFixed(2) + ' Bytes';
}

function formatNumber(num) {
    if (isNaN(num) || num === null) return "";
    if (num >= 1e18) return (num / 1e18).toFixed(1) + " Qi";
    if (num >= 1e15) return (num / 1e15).toFixed(1) + " Qa";
    if (num >= 1e12) return (num / 1e12).toFixed(1) + " T";
    if (num >= 1e9)  return (num / 1e9).toFixed(1) + " B";
    if (num >= 1e6)  return (num / 1e6).toFixed(1) + " M";
    if (num >= 1e3)  return (num / 1e3).toFixed(1) + " K";
    return num.toLocaleString('en-US');
}

// Global Chart Instance
let compChart = null;
let detailNChart = null;
let detailMChart = null;
let detailParamChart = null;
let currentTab = 'unified';

// DOM Access
const nInput = document.getElementById('n-input');
const pInput = document.getElementById('p-input');
const tAdd = document.getElementById('need-add');
const tDel = document.getElementById('need-delete');

const outBloomMem = document.getElementById('bloom-mem');
const outBloomBPI = document.getElementById('bloom-bpi');
const outBloomConfig = document.getElementById('bloom-config');
const outBloomFPR = document.getElementById('bloom-fpr');
const cardBloom = document.getElementById('card-bloom');

const outCuckooMem = document.getElementById('cuckoo-mem');
const outCuckooBPI = document.getElementById('cuckoo-bpi');
const outCuckooConfig = document.getElementById('cuckoo-config');
const outCuckooFPR = document.getElementById('cuckoo-fpr');
const cardCuckoo = document.getElementById('card-cuckoo');

const outXorMem = document.getElementById('xor-mem');
const outXorBPI = document.getElementById('xor-bpi');
const outXorConfig = document.getElementById('xor-config');
const outXorFPR = document.getElementById('xor-fpr');
const cardXor = document.getElementById('card-xor');

function evaluateBloom(n, p, needAdd, needDel, kOverride) {
    const valid = !needDel;
    let bpi, k;
    if (kOverride && !isNaN(kOverride) && kOverride >= 1) {
        k = Math.round(kOverride);
        bpi = -k / Math.log(1 - Math.pow(p, 1 / k));
    } else {
        let idealBPI = -(Math.log(p)) / (Math.LN2 * Math.LN2);
        k = Math.max(1, Math.round(idealBPI * Math.LN2));
        bpi = -k / Math.log(1 - Math.pow(p, 1 / k));
    }
    const mem = Math.ceil(n * bpi);
    let actualBPI = mem / n;
    let fpr = Math.pow(1 - Math.exp(-k / actualBPI), k);
    return { name: "Bloom", valid, bpi: actualBPI, mem, config: "k=" + k, fpr, error: valid ? "" : "Cannot Delete" };
}

function evaluateCuckoo(n, p, needAdd, needDel, bOverride) {
    const valid = true; // Cuckoo can add and delete
    let b = bOverride ? parseInt(bOverride) : 4;

    // Load factor based on b
    let alpha = 0.955;
    if (b === 2) alpha = 0.84;
    else if (b === 8) alpha = 0.98;

    const f = Math.ceil(Math.log2((2 * b) / p));
    const bpi = f / alpha;
    const mem = Math.ceil(n * bpi);
    let fpr = (2 * b) / Math.pow(2, f);
    return { name: "Cuckoo", valid, bpi, mem, config: "f=" + f, fpr, error: "" };
}

function evaluateXor(n, p, needAdd, needDel, fOverride) {
    const valid = !needAdd && !needDel;
    let autoF = Math.ceil(-Math.log2(p));
    let f = autoF;

    if (fOverride === 8 || fOverride === 16 || fOverride === 32) {
        f = fOverride;
    }
    const bpi = 1.23 * f;
    const mem = Math.ceil(n * bpi);
    let fpr = Math.pow(2, -f);

    let configStr = "f=" + f;
    if (f < autoF) configStr += " (⚠️ High FPR)";

    return { name: "XOR", valid, bpi, mem, config: configStr, fpr, error: valid ? "" : "Static Only" };
}

function updateCard(card, outMem, outBPI, outConfig, outFPR, evalResult, isManual) {
    card.classList.remove('winner', 'disqualified', 'rank-2', 'rank-3');
    card.removeAttribute('data-badge');

    outMem.innerText = formatBytes(evalResult.mem);
    outBPI.innerText = "Bits/item: " + evalResult.bpi.toFixed(2);

    const prefix = isManual ? "Manual " : "Optimal ";
    outConfig.innerText = prefix + evalResult.config;

    let percentFPR = evalResult.fpr * 100;
    outFPR.innerText = "Actual FPR: " + (percentFPR < 0.0001 ? percentFPR.toExponential(2) : percentFPR.toPrecision(4)) + "%";

    if (!evalResult.valid) {
        card.classList.add('disqualified');
        card.setAttribute('data-badge', '❌ Unsupported');
    }
}

function updateUI() {
    let n = parseFloat(nInput.value) || 100000000;
    let p = parseFloat(pInput.value) || 0.01;
    let needAdd = tAdd.checked;
    let needDel = tDel.checked;

    document.getElementById('n-unit-display').innerText = formatNumber(n);
    document.getElementById('p-unit-display').innerText = (p * 100).toPrecision(6) + '%';

    let kOverride = parseInt(document.getElementById('bloom-k-override').value);
    let bOverride = parseInt(document.getElementById('cuckoo-b-override').value);
    let fOverride = parseInt(document.getElementById('xor-f-override').value);

    let rBloom = evaluateBloom(n, p, needAdd, needDel, kOverride);
    let rCuckoo = evaluateCuckoo(n, p, needAdd, needDel, bOverride);
    let rXor = evaluateXor(n, p, needAdd, needDel, fOverride);

    updateCard(cardBloom, outBloomMem, outBloomBPI, outBloomConfig, outBloomFPR, rBloom, !isNaN(kOverride));
    updateCard(cardCuckoo, outCuckooMem, outCuckooBPI, outCuckooConfig, outCuckooFPR, rCuckoo, !isNaN(bOverride));
    updateCard(cardXor, outXorMem, outXorBPI, outXorConfig, outXorFPR, rXor, !isNaN(fOverride));

    // Pick Winner (Valid + Lowest Mem)
    let candidates = [rBloom, rCuckoo, rXor].filter(c => c.valid);
    candidates.sort((a, b) => a.mem - b.mem);

    candidates.forEach((c, index) => {
        let DOMCard;
        if (c.name === "Bloom") DOMCard = cardBloom;
        else if (c.name === "Cuckoo") DOMCard = cardCuckoo;
        else if (c.name === "XOR") DOMCard = cardXor;

        if (index === 0) {
            DOMCard.classList.add('winner');
            DOMCard.setAttribute('data-badge', '🏆 1st Choice');
        } else if (index === 1) {
            DOMCard.classList.add('rank-2');
            DOMCard.setAttribute('data-badge', '🥈 2nd Choice');
        } else if (index === 2) {
            DOMCard.classList.add('rank-3');
            DOMCard.setAttribute('data-badge', '🥉 3rd Choice');
        }
    });

    if (currentTab === 'unified') {
        drawComparisonChart();
    } else {
        drawDetailCharts(currentTab);
    }
}

function drawComparisonChart() {
    const ctx = document.getElementById('compChart').getContext('2d');
    let xVals = [];
    let bloomIdeal = [], bloomActive = [];
    let cuckooIdeal = [], cuckooActive = [];
    let xorIdeal = [], xorActive = [];

    let pValues = [0.1, 0.05, 0.01, 0.005, 0.001, 0.0005, 0.0001];

    let kOverride = parseInt(document.getElementById('bloom-k-override').value);
    let bOverride = parseInt(document.getElementById('cuckoo-b-override').value);
    let fOverride = parseInt(document.getElementById('xor-f-override').value);

    pValues.forEach(p => {
        xVals.push(p * 100);
        // Ideal series (Auto)
        bloomIdeal.push(evaluateBloom(1, p, false, false, NaN).bpi);
        cuckooIdeal.push(evaluateCuckoo(1, p, false, false, NaN).bpi);
        xorIdeal.push(evaluateXor(1, p, false, false, NaN).bpi);

        // Active series (Current Card Settings)
        bloomActive.push(evaluateBloom(1, p, false, false, kOverride).bpi);
        cuckooActive.push(evaluateCuckoo(1, p, false, false, bOverride).bpi);
        xorActive.push(evaluateXor(1, p, false, false, fOverride).bpi);
    });

    if (compChart) {
        compChart.data.datasets[0].data = bloomActive;
        compChart.data.datasets[1].data = bloomIdeal;
        compChart.data.datasets[2].data = cuckooActive;
        compChart.data.datasets[3].data = cuckooIdeal;
        compChart.data.datasets[4].data = xorActive;
        compChart.data.datasets[5].data = xorIdeal;
        compChart.update();
    } else {
        Chart.defaults.color = '#94a3b8';
        Chart.defaults.font.family = "'Inter', sans-serif";
        compChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: xVals.map(x => x + "%"),
                datasets: [
                    // Bloom
                    {
                        label: 'Bloom',
                        data: bloomActive,
                        borderColor: '#c084fc',
                        backgroundColor: '#c084fc',
                        borderWidth: 3,
                        pointRadius: 4,
                        tension: 0.1,
                        z: 10
                    },
                    {
                        label: 'Bloom [Ideal]',
                        data: bloomIdeal,
                        borderColor: 'rgba(192, 132, 252, 0.4)',
                        backgroundColor: 'transparent',
                        borderDash: [5, 5],
                        borderWidth: 1.5,
                        pointRadius: 0,
                        tension: 0.1
                    },
                    // Cuckoo
                    {
                        label: 'Cuckoo',
                        data: cuckooActive,
                        borderColor: '#38bdf8',
                        backgroundColor: '#38bdf8',
                        borderWidth: 3,
                        pointRadius: 4,
                        tension: 0.1,
                        z: 10
                    },
                    {
                        label: 'Cuckoo [Ideal]',
                        data: cuckooIdeal,
                        borderColor: 'rgba(56, 189, 248, 0.4)',
                        backgroundColor: 'transparent',
                        borderDash: [5, 5],
                        borderWidth: 1.5,
                        pointRadius: 0,
                        tension: 0.1
                    },
                    // XOR
                    {
                        label: 'XOR',
                        data: xorActive,
                        borderColor: '#34d399',
                        backgroundColor: '#34d399',
                        borderWidth: 3,
                        pointRadius: 4,
                        tension: 0.1,
                        z: 10
                    },
                    {
                        label: 'XOR [Ideal]',
                        data: xorIdeal,
                        borderColor: 'rgba(52, 211, 153, 0.4)',
                        backgroundColor: 'transparent',
                        borderDash: [5, 5],
                        borderWidth: 1.5,
                        pointRadius: 0,
                        tension: 0.1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Target FPR (%)' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    y: {
                        title: { display: true, text: 'Bits Per Item (Theoretical limits)' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    }
                },
                plugins: {
                    legend: {
                        labels: {
                            boxWidth: 12,
                            padding: 8,
                            font: { size: 11 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (c) {
                                return c.dataset.label + ': ' + c.raw.toFixed(2) + ' bits';
                            }
                        }
                    }
                }
            }
        });
    }
}

// Input bindings
[nInput, pInput].forEach(el => {
    if (!el) return;
    el.addEventListener('input', () => {
        if (el.id === 'n-input') {
            let val = parseFloat(el.value);
            if (!isNaN(val)) {
                document.getElementById('n-unit-display').innerText = formatNumber(val);
            } else {
                document.getElementById('n-unit-display').innerText = '';
            }
        } else if (el.id === 'p-input') {
            let valStr = el.value;
            // 입력되는 즉시 6자리 초과 소수점 자르기
            if (valStr.includes('.')) {
                let parts = valStr.split('.');
                if (parts[1].length > 6) {
                    el.value = parts[0] + '.' + parts[1].substring(0, 6);
                }
            }
            // 0.99를 초과하는 값 입력 즉시 차단
            let val = parseFloat(el.value);
            if (!isNaN(val) && val > 0.99) {
                el.value = "0.99";
                val = 0.99;
            }
            
            if (!isNaN(val)) {
                document.getElementById('p-unit-display').innerText = (val * 100).toPrecision(6) + '%';
            } else {
                document.getElementById('p-unit-display').innerText = '';
            }
        }
    });
    el.addEventListener('change', () => {
        if (el.id === 'p-input') {
            let val = parseFloat(el.value);
            if (isNaN(val)) val = 0.01;
            if (val > 0.99) val = 0.99;
            if (val < 0.000001) val = 0.000001;
            // Prevent excessively long decimals (e.g., restrict to 6 decimal places max for FPR)
            val = Number(val.toFixed(6));
            el.value = val;
            updateUI();
        } else if (el.id === 'n-input') {
            let val = parseFloat(el.value);
            if (isNaN(val) || val < 1) val = 100000000;
            val = Math.round(val);
            
            // 1B 이상이면 지수 표기법으로 변환, 아니면 일반 숫자 표기
            if (val >= 1000000000) {
                let expStr = val.toExponential();
                // '1e+10' 형식에서 '+'를 제거하여 더 깔끔한 '1e10' 형태로 만듦
                el.value = expStr.replace('+', '');
            } else {
                el.value = val;
            }
            updateUI();
        }
    });
    el.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') updateUI();
    });
});

// Tab Switch Logic
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        currentTab = e.target.getAttribute('data-target');
        
        const unifiedView = document.getElementById('view-unified');
        const detailView = document.getElementById('view-detail');
        const mainTitle = document.getElementById('chart-main-title');
        const mainDesc = document.getElementById('chart-main-desc');
        const paramTitle = document.getElementById('detail-param-title');
        
        if (currentTab === 'unified') {
            unifiedView.style.display = 'flex';
            detailView.style.display = 'none';
            mainTitle.innerText = "Bits per Item vs FPR Accuracy";
            mainDesc.innerText = "Comparison of theoretical density. Lower lines are more memory-efficient.";
        } else {
            unifiedView.style.display = 'none';
            detailView.style.display = 'flex';
            mainTitle.innerText = currentTab + " Filter Deep Dive";
            mainDesc.innerText = "Explore how FPR changes across different parameters.";
            
            if (currentTab === 'Bloom') paramTitle.innerText = "FPR vs Hash Ops (k)";
            else if (currentTab === 'Cuckoo') paramTitle.innerText = "FPR vs Bucket Size (b)";
            else if (currentTab === 'XOR') paramTitle.innerText = "FPR vs Fingerprint (f)";
        }
        
        updateUI();
    });
});

function drawDetailCharts(filterType) {
    let baseN = parseFloat(nInput.value) || 100000000;
    let baseP = parseFloat(pInput.value) || 0.01;
    let needAdd = tAdd.checked;
    let needDel = tDel.checked;
    
    let kOverride = parseInt(document.getElementById('bloom-k-override').value);
    let bOverride = parseInt(document.getElementById('cuckoo-b-override').value);
    let fOverride = parseInt(document.getElementById('xor-f-override').value);
    
    // Evaluate base values to find fixed M and Param
    let baseEval;
    let fixedParam;
    if (filterType === 'Bloom') {
        baseEval = evaluateBloom(baseN, baseP, needAdd, needDel, kOverride);
        fixedParam = baseEval.config.replace('k=', '');
    } else if (filterType === 'Cuckoo') {
        baseEval = evaluateCuckoo(baseN, baseP, needAdd, needDel, bOverride);
        fixedParam = bOverride || 4; // base b
    } else if (filterType === 'XOR') {
        baseEval = evaluateXor(baseN, baseP, needAdd, needDel, fOverride);
        fixedParam = baseEval.config.split(' ')[0].replace('f=', '');
    }
    
    let fixedM = baseEval.mem;
    fixedParam = parseFloat(fixedParam);

    // Common chart options
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { 
                type: 'logarithmic',
                title: { display: true, text: 'Actual FPR (Log)', font: { size: 11 } },
                grid: { color: 'rgba(255,255,255,0.05)' },
                ticks: {
                    callback: function(value) {
                        return value.toExponential(0);
                    }
                }
            }
        },
        plugins: { legend: { display: false } }
    };
    
    // Get chart context colors
    let chartColor = '#c084fc';
    if (filterType === 'Cuckoo') chartColor = '#38bdf8';
    if (filterType === 'XOR') chartColor = '#34d399';

    // 1. FPR vs n (fixed M, fixed param)
    let nVals = [], nFPRs = [];
    for (let i = 0.1; i <= 2.0; i += 0.1) {
        let testN = baseN * i;
        nVals.push(formatNumber(testN));
        if (filterType === 'Bloom') {
            let actualBPI = fixedM / testN;
            nFPRs.push(Math.pow(1 - Math.exp(-fixedParam / actualBPI), fixedParam));
        } else if (filterType === 'Cuckoo') {
            let actualAlpha = 0.955; if (fixedParam===2) actualAlpha=0.84; else if (fixedParam===8) actualAlpha=0.98;
            let actualF = (fixedM * actualAlpha) / testN;
            nFPRs.push((2 * fixedParam) / Math.pow(2, actualF));
        } else if (filterType === 'XOR') {
            let actualF = fixedM / (1.23 * testN);
            nFPRs.push(Math.pow(2, -actualF));
        }
    }
    
    // 2. FPR vs m (fixed N, fixed param)
    let mVals = [], mFPRs = [];
    for (let i = 0.5; i <= 3.0; i += 0.25) {
        let testM = fixedM * i;
        mVals.push(formatBytes(testM));
        if (filterType === 'Bloom') {
            let actualBPI = testM / baseN;
            mFPRs.push(Math.pow(1 - Math.exp(-fixedParam / actualBPI), fixedParam));
        } else if (filterType === 'Cuckoo') {
            let actualAlpha = 0.955; if (fixedParam===2) actualAlpha=0.84; else if (fixedParam===8) actualAlpha=0.98;
            let actualF = (testM * actualAlpha) / baseN;
            mFPRs.push((2 * fixedParam) / Math.pow(2, actualF));
        } else if (filterType === 'XOR') {
            let actualF = testM / (1.23 * baseN);
            mFPRs.push(Math.pow(2, -actualF));
        }
    }
    
    // 3. FPR vs param (fixed N, fixed M)
    let pVals = [], pFPRs = [];
    let bpi = fixedM / baseN;
    if (filterType === 'Bloom') {
        for (let k = 1; k <= 20; k++) {
            pVals.push(k);
            pFPRs.push(Math.pow(1 - Math.exp(-k / bpi), k));
        }
    } else if (filterType === 'Cuckoo') {
        [2, 4, 8].forEach(b => {
            pVals.push(b);
            let alpha = 0.955; if (b===2) alpha=0.84; else if (b===8) alpha=0.98;
            let f = bpi * alpha;
            pFPRs.push((2 * b) / Math.pow(2, f));
        });
    } else if (filterType === 'XOR') {
        [8, 16, 32].forEach(f => {
            pVals.push(f);
            // XOR ignores baseM here because f directly sets memory and FPR
            pFPRs.push(Math.pow(2, -f));
        });
    }

    // Draw Chart 1
    if (detailNChart) detailNChart.destroy();
    detailNChart = new Chart(document.getElementById('detail-n-chart').getContext('2d'), {
        type: 'line',
        data: {
            labels: nVals,
            datasets: [{ data: nFPRs, borderColor: chartColor, backgroundColor: chartColor, borderWidth: 2, pointRadius: 2, tension: 0.1 }]
        },
        options: commonOptions
    });
    
    // Draw Chart 2
    if (detailMChart) detailMChart.destroy();
    detailMChart = new Chart(document.getElementById('detail-m-chart').getContext('2d'), {
        type: 'line',
        data: {
            labels: mVals,
            datasets: [{ data: mFPRs, borderColor: chartColor, backgroundColor: chartColor, borderWidth: 2, pointRadius: 2, tension: 0.1 }]
        },
        options: commonOptions
    });
    
    // Draw Chart 3
    if (detailParamChart) detailParamChart.destroy();
    detailParamChart = new Chart(document.getElementById('detail-param-chart').getContext('2d'), {
        type: 'line',
        data: {
            labels: pVals,
            datasets: [{ data: pFPRs, borderColor: chartColor, backgroundColor: chartColor, borderWidth: 2, pointRadius: 3, tension: 0.1 }]
        },
        options: commonOptions
    });
}

// Initial
updateUI();
