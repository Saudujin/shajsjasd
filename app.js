/*
 * تطبيق منشئ الجدول الدراسي الذكي (الإصدار المحسن)
 * هذا الملف يدير منطق الخطوات المتعددة، توليد الجدول، عرض التقويم، الإحصائيات،
 * التصدير والمشاركة، بالإضافة إلى الملاحظات التفاعلية للكروت.
 */

document.addEventListener('DOMContentLoaded', () => {
  // عناصر الخطوات والمؤشرات
  const indicators = [
    document.getElementById('indicator-1'),
    document.getElementById('indicator-2'),
    document.getElementById('indicator-3'),
    document.getElementById('indicator-4'),
  ];
  const steps = [
    document.getElementById('step1'),
    document.getElementById('step2'),
    document.getElementById('step3'),
    document.getElementById('step4'),
  ];
  const genderSelect = document.getElementById('gender');
  const levelSelect = document.getElementById('level');
  const coursesList = document.getElementById('courses-list');
  const timePrefSelect = document.getElementById('timePref');
  const avoidDaysInputs = () => Array.from(document.querySelectorAll('#step3 .days-list input[type="checkbox"]:checked')).map((cb) => cb.value);
  const statsDiv = document.getElementById('stats');
  const scheduleOutput = document.getElementById('schedule-output');
  const alternativesDiv = document.getElementById('alternatives');
  const calendarGrid = document.getElementById('calendar-grid');
  // أزرار الخطوات
  const toStep2Btn = document.getElementById('to-step2');
  const toStep3Btn = document.getElementById('to-step3');
  const toStep4Btn = document.getElementById('to-step4');
  const backTo1Btn = document.getElementById('back-to-1');
  const backTo2Btn = document.getElementById('back-to-2');
  const backTo3Btn = document.getElementById('back-to-3');
  // أزرار التصدير والمشاركة
  const exportIcalBtn = document.getElementById('export-ical');
  const shareScheduleBtn = document.getElementById('share-schedule');
  // المودال والملاحظات
  const modal = document.getElementById('card-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalDetails = document.getElementById('modal-details');
  const noteInput = document.getElementById('note-input');
  const saveNoteBtn = document.getElementById('save-note');
  const closeModalBtn = document.getElementById('close-modal');

  // تحميل البيانات من المتغير العالمي SCHEDULE_DATA
  const dataset = window.SCHEDULE_DATA || null;
  if (!dataset) {
    console.error('لم يتم تحميل بيانات الجدول.');
  }

  // حالة التطبيق
  const selectedCourses = new Set();
  let lastGeneratedSchedule = null;
  const notes = {}; // key: course-day-start -> note string
  let currentModalKey = null;

  /**
   * إظهار خطوة معينة وتحديث شريط التقدم
   * @param {number} n - رقم الخطوة (1-4)
   */
  function showStep(n) {
    steps.forEach((stepEl, idx) => {
      if (idx === n - 1) {
        stepEl.classList.remove('hidden');
        indicators[idx].classList.add('active');
      } else {
        stepEl.classList.add('hidden');
        indicators[idx].classList.remove('active');
      }
    });
  }

  /**
   * تحديث قائمة المقررات بناءً على الجنس والمستوى
   */
  function updateCourses() {
    selectedCourses.clear();
    coursesList.innerHTML = '';
    if (!dataset) return;
    const gender = genderSelect.value;
    const level = levelSelect.value;
    const sections = dataset[gender][level];
    // استخراج المقررات الفريدة
    const courseNames = Array.from(new Set(sections.map((s) => s.course))).sort();
    courseNames.forEach((course) => {
      const div = document.createElement('div');
      div.className = 'course-item';
      div.textContent = course;
      div.addEventListener('click', () => {
        if (div.classList.contains('selected')) {
          div.classList.remove('selected');
          selectedCourses.delete(course);
        } else {
          div.classList.add('selected');
          selectedCourses.add(course);
        }
      });
      coursesList.appendChild(div);
    });
  }

  /**
   * تحويل رقم اليوم إلى اسم عربي
   */
  function dayName(day) {
    const names = {1: 'الأحد', 2: 'الإثنين', 3: 'الثلاثاء', 4: 'الأربعاء', 5: 'الخميس'};
    return names[day] || `اليوم ${day}`;
  }

  /**
   * تحويل دقائق إلى HH:MM بتنسيق 24 ساعة
   */
  function minutesToTime(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    const pad = (x) => (x < 10 ? '0' + x : x);
    let displayHour = h;
    if (h < 8) {
      displayHour = h + 12;
    }
    return `${pad(displayHour)}:${pad(m)}`;
  }

  /**
   * تقييم جدول وفق التفضيلات (يستخدم للدرجة والفجوات)
   */
  function evaluateSchedule(schedule, preferences) {
    let conflicts = 0;
    let score = 0;
    let totalGaps = 0;
    const timePref = preferences.timePref;
    const avoidDays = preferences.avoidDays || [];
    schedule.forEach((s) => {
      const isMorning = s.start < 12 * 60;
      if (timePref === 'morning' && isMorning) score += 5;
      else if (timePref === 'evening' && !isMorning) score += 5;
      if (avoidDays.includes(String(s.day))) score -= 3;
    });
    const byDay = {};
    schedule.forEach((s) => {
      byDay[s.day] = byDay[s.day] || [];
      byDay[s.day].push(s);
    });
    Object.values(byDay).forEach((list) => {
      list.sort((a, b) => a.start - b.start);
      for (let i = 0; i < list.length - 1; i++) {
        const gap = list[i + 1].start - list[i].end;
        if (gap > 0) totalGaps += gap;
        else conflicts++;
      }
    });
    score -= totalGaps / 30;
    return { score, conflicts, gaps: totalGaps };
  }

  /**
   * توليد أفضل الجداول الممكنة
   * يعيد مصفوفة بأفضل 3 جداول
   */
  function generateSchedule(sections, selected, preferences) {
    const courseList = Array.from(selected);
    const optionsByCourse = {};
    courseList.forEach((course) => {
      optionsByCourse[course] = sections.filter((s) => s.course === course);
    });
    const bestSchedules = [];
    function backtrack(index, current) {
      if (index === courseList.length) {
        const res = evaluateSchedule(current, preferences);
        if (res.conflicts === 0) {
          bestSchedules.push({ schedule: current.slice(), score: res.score });
          bestSchedules.sort((a, b) => b.score - a.score);
          if (bestSchedules.length > 3) bestSchedules.pop();
        }
        return;
      }
      const course = courseList[index];
      for (const option of optionsByCourse[course]) {
        let conflict = false;
        for (const c of current) {
          if (c.day === option.day && !(option.end <= c.start || option.start >= c.end)) {
            conflict = true;
            break;
          }
        }
        if (conflict) continue;
        current.push(option);
        backtrack(index + 1, current);
        current.pop();
      }
    }
    backtrack(0, []);
    return bestSchedules;
  }

  /**
   * عرض جدول في هيئة جدول HTML
   */
  function renderScheduleTable(schedule, container, title) {
    const heading = document.createElement('h3');
    heading.textContent = title;
    container.appendChild(heading);
    const table = document.createElement('table');
    table.className = 'schedule-table';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['المقرر', 'اليوم', 'الوقت', 'الأستاذ/الأستاذة', 'الشعبة'].forEach((h) => {
      const th = document.createElement('th');
      th.textContent = h;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    schedule.forEach((s) => {
      const tr = document.createElement('tr');
      const cells = [
        s.course,
        dayName(s.day),
        minutesToTime(s.start) + ' - ' + minutesToTime(s.end),
        s.instructor || '-',
        s.section || '-',
      ];
      cells.forEach((c) => {
        const td = document.createElement('td');
        td.textContent = c;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  }

  /**
   * عرض الإحصائيات الخاصة بالجدول
   */
  function showStats(schedule) {
    statsDiv.innerHTML = '';
    if (!schedule || schedule.length === 0) return;
    const totalCourses = schedule.length;
    let totalMinutes = 0;
    let earliestStart = Infinity;
    let latestEnd = -Infinity;
    const daysSet = new Set();
    schedule.forEach((c) => {
      totalMinutes += c.end - c.start;
      if (c.start < earliestStart) earliestStart = c.start;
      if (c.end > latestEnd) latestEnd = c.end;
      daysSet.add(c.day);
    });
    const totalHours = (totalMinutes / 60).toFixed(1);
    const hoursObj = minutesToTime(earliestStart) + ' - ' + minutesToTime(latestEnd);
    const statItems = [
      { label: 'عدد المقررات', value: totalCourses },
      { label: 'إجمالي الساعات', value: totalHours + ' ساعة' },
      { label: 'عدد الأيام', value: daysSet.size },
      { label: 'أول وقت - آخر وقت', value: hoursObj },
    ];
    statItems.forEach(({ label, value }) => {
      const div = document.createElement('div');
      div.innerHTML = `<strong>${label}:</strong> ${value}`;
      statsDiv.appendChild(div);
    });
  }

  /**
   * رسم التقويم الأسبوعي مع إمكانية الضغط على الكروت لإضافة ملاحظات
   */
  function renderCalendar(schedule) {
    calendarGrid.innerHTML = '';
    if (!schedule || schedule.length === 0) return;
    let minTime = Infinity;
    let maxTime = -Infinity;
    schedule.forEach((c) => {
      if (c.start < minTime) minTime = c.start;
      if (c.end > maxTime) maxTime = c.end;
    });
    minTime = Math.floor(minTime / 60) * 60;
    maxTime = Math.ceil(maxTime / 60) * 60;
    const timeRange = maxTime - minTime;
    const dayNames = {1: 'الأحد', 2: 'الإثنين', 3: 'الثلاثاء', 4: 'الأربعاء', 5: 'الخميس'};
    for (let d = 1; d <= 5; d++) {
      const dayCol = document.createElement('div');
      dayCol.className = 'calendar-day';
      const header = document.createElement('div');
      header.className = 'calendar-day-header';
      header.textContent = dayNames[d];
      dayCol.appendChild(header);
      calendarGrid.appendChild(dayCol);
    }
    const palette = ['#60a5fa','#34d399','#f59e0b','#f87171','#a78bfa','#fb7185','#14b8a6','#eab308'];
    const courseColors = {};
    let colorIndex = 0;
    schedule.forEach((c) => {
      if (!courseColors[c.course]) {
        courseColors[c.course] = palette[colorIndex % palette.length];
        colorIndex++;
      }
    });
    schedule.forEach((c) => {
      const dayIndex = c.day - 1;
      const dayCol = calendarGrid.children[dayIndex];
      if (!dayCol) return;
      const card = document.createElement('div');
      card.className = 'class-card';
      card.style.backgroundColor = courseColors[c.course];
      const topPct = ((c.start - minTime) / timeRange) * 100;
      const heightPct = ((c.end - c.start) / timeRange) * 100;
      card.style.top = topPct + '%';
      card.style.height = heightPct + '%';
      // مفتاح فريد للملاحظات
      const key = `${c.course}|${c.day}|${c.start}`;
      card.dataset.key = key;
      if (notes[key]) {
        card.classList.add('has-note');
      }
      card.innerHTML = `<strong>${c.course}</strong><br>${minutesToTime(c.start)} - ${minutesToTime(c.end)}<br>${c.instructor || ''}`;
      card.addEventListener('click', () => openModalForCard(c, key));
      dayCol.appendChild(card);
    });
  }

  /**
   * فتح المودال لكارت معين
   */
  function openModalForCard(classObj, key) {
    currentModalKey = key;
    modalTitle.textContent = classObj.course;
    // بناء تفاصيل المادة مع فواصل الأسطر
    let details = `${dayName(classObj.day)}\n${minutesToTime(classObj.start)} - ${minutesToTime(classObj.end)}`;
    if (classObj.room) details += `\nالقاعة: ${classObj.room}`;
    if (classObj.instructor) details += `\nالدكتور/ة: ${classObj.instructor}`;
    if (classObj.section) details += `\nالشعبة: ${classObj.section}`;
    // استبدال \n بعلامات <br> للعرض
    modalDetails.innerHTML = details.replace(/\n/g, '<br>');
    noteInput.value = notes[key] || '';
    modal.classList.remove('hidden');
  }

  /**
   * إغلاق المودال وإعادة الوضع السابق
   */
  function closeModal() {
    modal.classList.add('hidden');
    currentModalKey = null;
  }

  // حفظ الملاحظة للمادة الحالية
  saveNoteBtn.addEventListener('click', () => {
    if (currentModalKey) {
      const text = noteInput.value.trim();
      if (text) {
        notes[currentModalKey] = text;
      } else {
        delete notes[currentModalKey];
      }
      // تحديث مظهر الكروت
      document.querySelectorAll('.class-card').forEach((card) => {
        const k = card.dataset.key;
        if (notes[k]) {
          card.classList.add('has-note');
        } else {
          card.classList.remove('has-note');
        }
      });
    }
    closeModal();
  });
  closeModalBtn.addEventListener('click', closeModal);

  /**
   * إنشاء ملف iCal من الجدول الحالي
   */
  function generateICal(schedule) {
    const dayMap = {1:'SU',2:'MO',3:'TU',4:'WE',5:'TH'};
    const now = new Date();
    const day = now.getDay(); // 0 for Sunday
    const diff = now.getDate() - day;
    const sunday = new Date(now.setDate(diff));
    function formatDate(date, minutes) {
      const dt = new Date(date.getTime() + minutes * 60000);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      const hh = String(dt.getHours()).padStart(2, '0');
      const mm = String(dt.getMinutes()).padStart(2, '0');
      return `${y}${m}${d}T${hh}${mm}00`;
    }
    let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nCALSCALE:GREGORIAN\nMETHOD:PUBLISH\n';
    schedule.forEach((c, idx) => {
      const eventDate = new Date(sunday);
      eventDate.setDate(sunday.getDate() + (c.day - 1));
      const dtStart = formatDate(eventDate, c.start);
      const dtEnd = formatDate(eventDate, c.end);
      const byday = dayMap[c.day];
      ics += 'BEGIN:VEVENT\n';
      ics += `UID:event-${idx}@schedule\n`;
      ics += `DTSTAMP:${dtStart}\n`;
      ics += `DTSTART:${dtStart}\n`;
      ics += `DTEND:${dtEnd}\n`;
      ics += `RRULE:FREQ=WEEKLY;BYDAY=${byday};COUNT=14\n`;
      ics += `SUMMARY:${c.course}\n`;
      if (c.room) ics += `LOCATION:${c.room}\n`;
      if (c.instructor) ics += `DESCRIPTION:${c.instructor}\n`;
      ics += 'END:VEVENT\n';
    });
    ics += 'END:VCALENDAR';
    return ics;
  }

  /**
   * التعامل مع أزرار الانتقال بين الخطوات
   */
  toStep2Btn.addEventListener('click', () => {
    updateCourses();
    showStep(2);
  });
  backTo1Btn.addEventListener('click', () => {
    showStep(1);
    // إعادة تعيين الاختيارات عند الرجوع إلى البداية
    selectedCourses.clear();
    coursesList.innerHTML = '';
  });
  toStep3Btn.addEventListener('click', () => {
    if (selectedCourses.size === 0) {
      alert('اختر المقررات أولاً');
      return;
    }
    showStep(3);
  });
  backTo2Btn.addEventListener('click', () => {
    showStep(2);
  });
  toStep4Btn.addEventListener('click', () => {
    if (!dataset) return;
    if (selectedCourses.size === 0) {
      alert('اختر المقررات أولاً');
      return;
    }
    const gender = genderSelect.value;
    const level = levelSelect.value;
    const sections = dataset[gender][level];
    const preferences = {
      timePref: timePrefSelect.value,
      avoidDays: avoidDaysInputs(),
    };
    const best = generateSchedule(sections, selectedCourses, preferences);
    scheduleOutput.innerHTML = '';
    alternativesDiv.innerHTML = '';
    if (best.length === 0) {
      scheduleOutput.textContent = 'لم يتم العثور على جدول بدون تعارضات لهذه الاختيارات.';
      showStep(4);
      return;
    }
    // العرض الأول
    renderScheduleTable(best[0].schedule, scheduleOutput, 'أفضل جدول');
    // البدائل
    if (best.length > 1) {
      const altTitle = document.createElement('h3');
      altTitle.textContent = 'بدائل أخرى';
      alternativesDiv.appendChild(altTitle);
      for (let i = 1; i < best.length; i++) {
        const container = document.createElement('div');
        container.className = 'alt-schedule';
        renderScheduleTable(best[i].schedule, container, 'بديل ' + i);
        alternativesDiv.appendChild(container);
      }
    }
    lastGeneratedSchedule = best[0].schedule;
    showStats(best[0].schedule);
    renderCalendar(best[0].schedule);
    showStep(4);
  });
  backTo3Btn.addEventListener('click', () => {
    showStep(3);
  });

  // تصدير الجدول الحالي إلى iCal
  exportIcalBtn.addEventListener('click', () => {
    if (!lastGeneratedSchedule) return;
    const ics = generateICal(lastGeneratedSchedule);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'schedule.ics';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  // مشاركة الجدول عبر رابط
  shareScheduleBtn.addEventListener('click', () => {
    if (!lastGeneratedSchedule) return;
    const payload = {
      gender: genderSelect.value,
      level: levelSelect.value,
      courses: Array.from(selectedCourses),
      schedule: lastGeneratedSchedule,
    };
    const jsonStr = JSON.stringify(payload);
    const encoded = btoa(unescape(encodeURIComponent(jsonStr)));
    const baseUrl = window.location.href.split('#')[0];
    const shareUrl = baseUrl + '#' + encoded;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        alert('تم نسخ رابط الجدول! يمكنك مشاركته الآن.');
      }, () => {
        prompt('انسخ الرابط التالي:', shareUrl);
      });
    } else {
      prompt('انسخ الرابط التالي:', shareUrl);
    }
  });

  // إعادة تحميل الجدول من رابط المشاركة إذا توفر
  (function loadSharedSchedule() {
    const hash = window.location.hash.substring(1);
    if (!hash) return;
    try {
      const decoded = decodeURIComponent(escape(atob(hash)));
      const obj = JSON.parse(decoded);
      if (obj && obj.schedule) {
        // تعبئة البيانات
        genderSelect.value = obj.gender;
        levelSelect.value = obj.level;
        updateCourses();
        // تحديد المقررات
        obj.courses.forEach((c) => selectedCourses.add(c));
        // تحديد العناصر المختارة في واجهة المقررات
        Array.from(coursesList.children).forEach((div) => {
          if (obj.courses.includes(div.textContent)) div.classList.add('selected');
        });
        lastGeneratedSchedule = obj.schedule;
        showStats(obj.schedule);
        renderScheduleTable(obj.schedule, scheduleOutput, 'جدول مشارك');
        renderCalendar(obj.schedule);
        showStep(4);
      }
    } catch (e) {
      console.error('فشل في تحميل الجدول المشترك:', e);
    }
  })();
});