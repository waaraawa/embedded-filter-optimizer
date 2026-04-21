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
    let str = num.toLocaleString('en-US');
    if (num >= 1000000000) return str + " (" + (num / 1000000000).toFixed(1) + " B)";
    if (num >= 1000000) return str + " (" + (num / 1000000).toFixed(1) + " M)";
    if (num >= 1000) return str + " (" + (num / 1000).toFixed(1) + " K)";
    return str;
}

// Global Chart Instance
let compChart = null;

// DOM Access
const nInput = document.getElementById('n-input');
const pInput = document.getElementById('p-input');
const tAdd = document.getElementById('need-add');
const tDel = document.getElementById('need-delete');

const outBloomMem = document.getElementById('bloom-mem');
const outBloomBPI = document.getElementById('bloom-bpi');
const outBloomConfig = document.getElementById('bloom-config');
const cardBloom = document.getElementById('card-bloom');

const outCuckooMem = document.getElementById('cuckoo-mem');
const outCuckooBPI = document.getElementById('cuckoo-bpi');
const outCuckooConfig = document.getElementById('cuckoo-config');
const cardCuckoo = document.getElementById('card-cuckoo');

const outXorMem = document.getElementById('xor-mem');
const outXorBPI = document.getElementById('xor-bpi');
const outXorConfig = document.getElementById('xor-config');
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
    return { name: "Bloom", valid, bpi, mem, config: "k=" + k, error: valid ? "" : "Cannot Delete" };
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
    return { name: "Cuckoo", valid, bpi, mem, config: "f=" + f, error: "" };
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

    let configStr = "f=" + f;
    if (f < autoF) configStr += " (⚠️ High FPR)";

    return { name: "XOR", valid, bpi, mem, config: configStr, error: valid ? "" : "Static Only" };
}

function updateCard(card, outMem, outBPI, outConfig, evalResult, isManual) {
    card.classList.remove('winner', 'disqualified', 'rank-2', 'rank-3');
    card.removeAttribute('data-badge');

    outMem.innerText = formatBytes(evalResult.mem);
    outBPI.innerText = "Bits/item: " + evalResult.bpi.toFixed(2);

    const prefix = isManual ? "Manual " : "Optimal ";
    outConfig.innerText = prefix + evalResult.config;

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

    updateCard(cardBloom, outBloomMem, outBloomBPI, outBloomConfig, rBloom, !isNaN(kOverride));
    updateCard(cardCuckoo, outCuckooMem, outCuckooBPI, outCuckooConfig, rCuckoo, !isNaN(bOverride));
    updateCard(cardXor, outXorMem, outXorBPI, outXorConfig, rXor, !isNaN(fOverride));

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

    drawComparisonChart();
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
            document.getElementById('n-unit-display').innerText = formatNumber(parseFloat(el.value));
        } else if (el.id === 'p-input') {
            document.getElementById('p-unit-display').innerText = (parseFloat(el.value) * 100).toPrecision(6) + '%';
        }
    });
    el.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') updateUI();
    });
});

// Initial
updateUI();
