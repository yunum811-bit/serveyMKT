document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('surveyForm');

    // === Populate time selects (24hr format) ===
    function populateTimeSelects() {
        const hourSelects = document.querySelectorAll('select[name$="TimeHour"]');
        const minSelects = document.querySelectorAll('select[name$="TimeMin"]');
        hourSelects.forEach(sel => {
            for (let h = 0; h < 24; h++) {
                const opt = document.createElement('option');
                opt.value = String(h).padStart(2, '0');
                opt.textContent = String(h).padStart(2, '0') + ' น.';
                sel.appendChild(opt);
            }
        });
        minSelects.forEach(sel => {
            [0, 15, 30, 45].forEach(m => {
                const opt = document.createElement('option');
                opt.value = String(m).padStart(2, '0');
                opt.textContent = String(m).padStart(2, '0') + ' นาที';
                sel.appendChild(opt);
            });
        });
    }
    populateTimeSelects();

    // === Conditional field toggles ===

    // Custom time section
    const timeSlotRadios = document.querySelectorAll('input[name="timeSlot"]');
    const customTimeSection = document.getElementById('customTimeSection');
    timeSlotRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            customTimeSection.style.display = this.value === 'ระบุเวลาเฉพาะ' ? 'block' : 'none';
        });
    });

    // Objective "อื่นๆ"
    setupOtherToggle('objectiveOther', 'objectiveOtherInput');

    // Lead source "อื่นๆ"
    setupOtherToggleRadio('leadSourceOther', 'leadSourceOtherInput');

    // Product "อื่นๆ"
    setupOtherToggle('productOther', 'productOtherInput');

    // Province "อื่นๆ"
    setupOtherToggleRadio('provinceOther', 'provinceOtherInput');

    // Competitor "อื่นๆ"
    setupOtherToggle('competitorOther', 'competitorOtherInput');

    // Next Step "อื่นๆ"
    setupOtherToggle('nextStepOther', 'nextStepOtherInput');

    // Next Step - proposal date
    const nextStepProposal = document.getElementById('nextStepProposal');
    const proposalDateSection = document.getElementById('proposalDateSection');
    nextStepProposal.addEventListener('change', function() {
        proposalDateSection.style.display = this.checked ? 'block' : 'none';
    });

    // Next Step - meeting date
    const nextStepMeeting = document.getElementById('nextStepMeeting');
    const meetingDateSection = document.getElementById('meetingDateSection');
    nextStepMeeting.addEventListener('change', function() {
        meetingDateSection.style.display = this.checked ? 'block' : 'none';
    });

    // Deal estimate
    const canEstimate = document.getElementById('canEstimate');
    const dealValueInput = document.getElementById('dealValueInput');
    document.querySelectorAll('input[name="dealEstimate"]').forEach(radio => {
        radio.addEventListener('change', function() {
            dealValueInput.style.display = this.value === 'คาดการณ์ได้' ? 'block' : 'none';
        });
    });

    // === File upload display ===
    document.getElementById('photo1').addEventListener('change', function() {
        document.getElementById('fileName1').textContent = this.files[0] ? this.files[0].name : '';
    });
    document.getElementById('photo2').addEventListener('change', function() {
        document.getElementById('fileName2').textContent = this.files[0] ? this.files[0].name : '';
    });

    // === Form submission ===
    form.addEventListener('submit', function(e) {
        e.preventDefault();

        // Clear previous errors
        document.querySelectorAll('.error').forEach(el => el.classList.remove('error'));
        document.querySelectorAll('.error-msg').forEach(el => el.remove());

        let isValid = true;

        // Validate required radio groups
        const requiredRadios = ['officer', 'timeSlot', 'province', 'supervisor'];
        requiredRadios.forEach(name => {
            const checked = form.querySelector(`input[name="${name}"]:checked`);
            if (!checked) {
                isValid = false;
                const section = form.querySelector(`input[name="${name}"]`).closest('.section');
                showError(section, 'กรุณาเลือกคำตอบ');
            }
        });

        // Validate required checkboxes (objective)
        const objectiveChecked = form.querySelectorAll('input[name="objective"]:checked');
        if (objectiveChecked.length === 0) {
            isValid = false;
            const section = form.querySelector('input[name="objective"]').closest('.section');
            showError(section, 'กรุณาเลือกอย่างน้อย 1 ข้อ');
        }

        // Validate required text fields
        const requiredTexts = ['companyName', 'contactPerson', 'summary'];
        requiredTexts.forEach(name => {
            const field = form.querySelector(`[name="${name}"]`);
            if (!field.value.trim()) {
                isValid = false;
                field.classList.add('error');
                showError(field.closest('.section'), 'กรุณากรอกข้อมูล');
            }
        });

        // Validate required date
        const workDate = form.querySelector('[name="workDate"]');
        if (!workDate.value) {
            isValid = false;
            workDate.classList.add('error');
            showError(workDate.closest('.section'), 'กรุณาเลือกวันที่');
        }

        // Validate required files
        const photo1 = document.getElementById('photo1');
        const photo2 = document.getElementById('photo2');
        if (!photo1.files.length) {
            isValid = false;
            showError(photo1.closest('.section'), 'กรุณาอัปโหลดภาพ');
        }
        if (!photo2.files.length) {
            isValid = false;
            showError(photo2.closest('.section'), 'กรุณาอัปโหลดภาพ');
        }

        if (isValid) {
            const formData = new FormData(form);

            // Combine time selects into startTime/endTime
            const startH = form.querySelector('[name="startTimeHour"]').value;
            const startM = form.querySelector('[name="startTimeMin"]').value;
            const endH = form.querySelector('[name="endTimeHour"]').value;
            const endM = form.querySelector('[name="endTimeMin"]').value;
            if (startH && startM) {
                formData.set('startTime', startH + ':' + startM);
            }
            if (endH && endM) {
                formData.set('endTime', endH + ':' + endM);
            }
            // Remove individual hour/min fields
            formData.delete('startTimeHour');
            formData.delete('startTimeMin');
            formData.delete('endTimeHour');
            formData.delete('endTimeMin');

            const token = localStorage.getItem('token');

            // Show loading state
            const submitBtn = form.querySelector('.submit-btn');
            submitBtn.disabled = true;
            submitBtn.textContent = 'กำลังส่ง...';

            fetch('/api/reports', {
                method: 'POST',
                headers: token ? { 'Authorization': 'Bearer ' + token } : {},
                body: formData
            })
            .then(res => res.json())
            .then(data => {
                submitBtn.disabled = false;
                submitBtn.textContent = 'ส่งแบบฟอร์ม';
                if (data.reportId) {
                    // Save custom answers
                    saveCustomAnswers(data.reportId, token);
                    document.getElementById('successModal').classList.add('active');
                } else {
                    alert(data.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
                }
            })
            .catch(err => {
                submitBtn.disabled = false;
                submitBtn.textContent = 'ส่งแบบฟอร์ม';
                alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่');
                console.error(err);
            });
        } else {
            // Scroll to first error
            const firstError = document.querySelector('.error-msg');
            if (firstError) {
                firstError.closest('.section').scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    });

    // === Helper functions ===
    function setupOtherToggle(checkboxId, inputId) {
        const checkbox = document.getElementById(checkboxId);
        const input = document.getElementById(inputId);
        if (checkbox && input) {
            checkbox.addEventListener('change', function() {
                input.style.display = this.checked ? 'block' : 'none';
            });
        }
    }

    function setupOtherToggleRadio(radioId, inputId) {
        const radio = document.getElementById(radioId);
        const input = document.getElementById(inputId);
        if (radio && input) {
            const name = radio.getAttribute('name') || radio.name;
            document.querySelectorAll(`input[name="${name}"]`).forEach(r => {
                r.addEventListener('change', function() {
                    input.style.display = radio.checked ? 'block' : 'none';
                });
            });
        }
    }

    function showError(section, message) {
        if (!section.querySelector('.error-msg')) {
            const msg = document.createElement('p');
            msg.className = 'error-msg';
            msg.textContent = message;
            section.appendChild(msg);
        }
    }
});

function closeModal() {
    document.getElementById('successModal').classList.remove('active');
    document.getElementById('surveyForm').reset();
    // Hide all conditional sections
    document.getElementById('customTimeSection').style.display = 'none';
    document.querySelectorAll('.conditional-input').forEach(el => el.style.display = 'none');
    document.getElementById('proposalDateSection').style.display = 'none';
    document.getElementById('meetingDateSection').style.display = 'none';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// === Save Custom Answers ===
function saveCustomAnswers(reportId, token) {
    const customInputs = document.querySelectorAll('[name^="custom_"]');
    if (customInputs.length === 0) return;

    const answersMap = {};
    customInputs.forEach(input => {
        const qId = input.name.replace('custom_', '');
        if (input.type === 'checkbox') {
            if (input.checked) {
                if (!answersMap[qId]) answersMap[qId] = [];
                answersMap[qId].push(input.value);
            }
        } else if (input.type === 'radio') {
            if (input.checked) {
                answersMap[qId] = input.value;
            }
        } else {
            if (input.value) {
                answersMap[qId] = input.value;
            }
        }
    });

    const answers = Object.entries(answersMap).map(([questionId, answer]) => ({
        questionId: parseInt(questionId),
        answer: Array.isArray(answer) ? answer.join(', ') : answer
    }));

    if (answers.length === 0) return;

    fetch('/api/reports/' + reportId + '/answers', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ answers })
    }).catch(e => console.error('Failed to save custom answers:', e));
}

// === Load Custom Questions ===
function loadCustomQuestions() {
    fetch('/api/questions')
        .then(r => r.json())
        .then(questions => {
            const container = document.getElementById('customQuestionsContainer');
            if (!container || questions.length === 0) return;

            container.innerHTML = questions.map(q => {
                let inputHtml = '';
                const reqMark = q.isRequired ? '<span class="req">*</span>' : '';
                const reqAttr = q.isRequired ? 'required' : '';

                switch (q.type) {
                    case 'text':
                        inputHtml = `<input type="text" name="custom_${q.id}" class="input-field" placeholder="กรุณาระบุ" ${reqAttr}>`;
                        break;
                    case 'textarea':
                        inputHtml = `<textarea name="custom_${q.id}" class="input-field textarea" rows="3" placeholder="กรุณาระบุ" ${reqAttr}></textarea>`;
                        break;
                    case 'number':
                        inputHtml = `<input type="number" name="custom_${q.id}" class="input-field" placeholder="กรุณาระบุตัวเลข" ${reqAttr}>`;
                        break;
                    case 'date':
                        inputHtml = `<input type="date" name="custom_${q.id}" class="input-field" ${reqAttr}>`;
                        break;
                    case 'radio': {
                        let opts = [];
                        try { opts = JSON.parse(q.options); } catch(e) {}
                        inputHtml = '<div class="radio-group">' + opts.map(opt =>
                            `<label class="radio-item">
                                <input type="radio" name="custom_${q.id}" value="${opt}" ${reqAttr}>
                                <span class="radio-custom"></span>
                                <span>${opt}</span>
                            </label>`
                        ).join('') + '</div>';
                        break;
                    }
                    case 'checkbox': {
                        let opts = [];
                        try { opts = JSON.parse(q.options); } catch(e) {}
                        inputHtml = '<div class="checkbox-group">' + opts.map(opt =>
                            `<label class="checkbox-item">
                                <input type="checkbox" name="custom_${q.id}" value="${opt}">
                                <span class="checkbox-custom"></span>
                                <span>${opt}</span>
                            </label>`
                        ).join('') + '</div>';
                        break;
                    }
                }

                return `<div class="section">
                    <label class="section-title">${q.label} ${reqMark}</label>
                    ${inputHtml}
                </div>`;
            }).join('');
        })
        .catch(e => console.error('Failed to load custom questions:', e));
}

// Load custom questions on page load
loadCustomQuestions();

// Load editable form options from API
loadFormOptions();

// Load user form config (hide fields per user)
loadUserFormConfig();

async function loadUserFormConfig() {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
        const res = await fetch('/api/user-form-config', { headers: { 'Authorization': 'Bearer ' + token } });
        const data = await res.json();
        if (data.hiddenFields && data.hiddenFields.length > 0) {
            data.hiddenFields.forEach(fieldKey => {
                // Find and hide sections containing this field
                const inputs = document.querySelectorAll(`[name="${fieldKey}"]`);
                inputs.forEach(input => {
                    const section = input.closest('.section');
                    if (section) section.style.display = 'none';
                });
            });
        }
    } catch(e) { /* use defaults */ }
}

async function loadFormOptions() {
    try {
        const res = await fetch('/api/form-options');
        const data = await res.json();
        if (!data || Object.keys(data).length === 0) return;

        // Update officers
        if (data.officers) updateRadioGroup('officer', data.officers.options, false, data.officers.label);
        // Update objectives
        if (data.objectives) updateCheckboxGroup('objective', data.objectives.options, true, data.objectives.label);
        // Update lead sources
        if (data.leadSources) updateRadioGroup('leadSource', data.leadSources.options, true, data.leadSources.label);
        // Update products
        if (data.products) updateCheckboxGroup('product', data.products.options, true, data.products.label);
        // Update provinces
        if (data.provinces) updateRadioGroup('province', data.provinces.options, true, data.provinces.label);
        // Update competitors
        if (data.competitors) updateCheckboxGroup('competitor', data.competitors.options, true, data.competitors.label);
        // Update supervisors
        if (data.supervisors) updateRadioGroup('supervisor', data.supervisors.options, false, data.supervisors.label);
        // Update next steps
        if (data.nextSteps) updateCheckboxGroup('nextStep', data.nextSteps.options, true, data.nextSteps.label);
    } catch(e) { /* use defaults */ }
}

function updateRadioGroup(name, options, hasOther, label) {
    const container = document.querySelector(`input[name="${name}"]`)?.closest('.radio-group');
    if (!container) return;
    // Update label/title
    if (label) {
        const titleEl = container.parentElement.querySelector('.section-title');
        if (titleEl) {
            const req = titleEl.querySelector('.req');
            titleEl.textContent = label + ' ';
            if (req) titleEl.appendChild(req);
        }
    }
    const otherInput = container.parentElement.querySelector('.conditional-input');
    container.innerHTML = options.map(opt =>
        `<label class="radio-item">
            <input type="radio" name="${name}" value="${opt}">
            <span class="radio-custom"></span>
            <span>${opt}</span>
        </label>`
    ).join('') + (hasOther ? `<label class="radio-item">
            <input type="radio" name="${name}" value="อื่นๆ" id="${name}Other">
            <span class="radio-custom"></span>
            <span>อื่นๆ</span>
        </label>` : '');
    if (hasOther && otherInput) {
        const otherRadio = document.getElementById(name + 'Other');
        if (otherRadio) {
            document.querySelectorAll(`input[name="${name}"]`).forEach(r => {
                r.addEventListener('change', () => { otherInput.style.display = otherRadio.checked ? 'block' : 'none'; });
            });
        }
    }
}

function updateCheckboxGroup(name, options, hasOther, label) {
    const container = document.querySelector(`input[name="${name}"]`)?.closest('.checkbox-group');
    if (!container) return;
    // Update label/title
    if (label) {
        const titleEl = container.parentElement.querySelector('.section-title');
        if (titleEl) {
            const req = titleEl.querySelector('.req');
            titleEl.textContent = label + ' ';
            if (req) titleEl.appendChild(req);
        }
    }
    const otherInput = container.parentElement.querySelector('.conditional-input');
    container.innerHTML = options.map(opt =>
        `<label class="checkbox-item">
            <input type="checkbox" name="${name}" value="${opt}">
            <span class="checkbox-custom"></span>
            <span>${opt}</span>
        </label>`
    ).join('') + (hasOther ? `<label class="checkbox-item">
            <input type="checkbox" name="${name}" value="อื่นๆ" id="${name}Other">
            <span class="checkbox-custom"></span>
            <span>อื่นๆ</span>
        </label>` : '');
    if (hasOther && otherInput) {
        const otherCb = document.getElementById(name + 'Other');
        if (otherCb) {
            otherCb.addEventListener('change', () => { otherInput.style.display = otherCb.checked ? 'block' : 'none'; });
        }
    }
}
