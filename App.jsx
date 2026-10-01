import { useEffect, useState } from 'react'
import { ArrowUpRight, BarChart3, Check, ChevronDown, ClipboardCheck, GraduationCap, LayoutDashboard, Menu, Plus, Settings, Trash2, Users, X } from 'lucide-react'

const navItems = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'today', label: "Today's attendance", icon: ClipboardCheck },
  { id: 'history', label: 'Attendance history', icon: BarChart3 },
  { id: 'new-class', label: 'Add new class', icon: Plus },
]
const webhookUrl = 'https://hook.eu1.make.com/bk87oou2f3rwlm2rgi7ypbixvmadu6pj'

function readStored(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

function dateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDate(value, options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) {
  return new Intl.DateTimeFormat(undefined, options).format(new Date(`${value}T12:00:00`))
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function App() {
  const [classes, setClasses] = useState(() => readStored('presenty.classes.v1', []))
  const [records, setRecords] = useState(() => readStored('presenty.attendance.v1', []))
  const [activeView, setActiveView] = useState('overview')
  const [selectedClassId, setSelectedClassId] = useState(() => readStored('presenty.selectedClass.v1', ''))
  const [historyClassId, setHistoryClassId] = useState('all')
  const [className, setClassName] = useState('')
  const [rosterDraft, setRosterDraft] = useState([{ name: '', parentPhone: '' }])
  const [attendanceDrafts, setAttendanceDrafts] = useState({})
  const [notice, setNotice] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [mobileNav, setMobileNav] = useState(false)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => { localStorage.setItem('presenty.classes.v1', JSON.stringify(classes)) }, [classes])
  useEffect(() => { localStorage.setItem('presenty.attendance.v1', JSON.stringify(records)) }, [records])
  useEffect(() => { localStorage.setItem('presenty.selectedClass.v1', JSON.stringify(selectedClassId)) }, [selectedClassId])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const today = dateKey(now)
  const selectedClass = classes.find((item) => item.id === selectedClassId) ?? classes[0] ?? null
  const todayRecord = records.find((record) => record.classId === selectedClass?.id && record.date === today)
  const todayRecords = records.filter((record) => record.date === today)
  const todaysPresent = todayRecords.reduce((sum, record) => sum + record.presentStudents, 0)
  const todaysTotal = todayRecords.reduce((sum, record) => sum + record.totalStudents, 0)
  const draftKey = `${selectedClass?.id ?? ''}:${today}`
  const absentNames = attendanceDrafts[draftKey] ?? todayRecord?.absentStudents.join(', ') ?? ''

  const notify = (message) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3500)
  }
  const changeView = (view) => {
    setActiveView(view)
    setMobileNav(false)
  }
  const updateRoster = (index, field, value) => {
    setRosterDraft((current) => current.map((student, row) => row === index ? { ...student, [field]: value } : student))
  }

  const createClass = (event) => {
    event.preventDefault()
    const cleanedName = className.trim()
    const students = rosterDraft.filter((student) => student.name.trim()).map((student, index) => ({
      id: newId(),
      rollNumber: String(index + 1).padStart(2, '0'),
      name: student.name.trim(),
      parentPhone: student.parentPhone.trim(),
    }))
    if (!cleanedName || !students.length) {
      notify('Enter a class name and at least one student.')
      return
    }
    const created = { id: newId(), name: cleanedName, short: cleanedName.slice(0, 10), students, color: 'green' }
    setClasses((current) => [...current, created])
    setSelectedClassId(created.id)
    setHistoryClassId(created.id)
    setClassName('')
    setRosterDraft([{ name: '', parentPhone: '' }])
    changeView('today')
    notify(`${cleanedName} added with ${students.length} students.`)
  }

  const deleteClass = (event, classToDelete) => {
    event.stopPropagation()
    if (!window.confirm(`Delete ${classToDelete.name} and its attendance history?`)) return

    const remainingClasses = classes.filter((item) => item.id !== classToDelete.id)
    setClasses(remainingClasses)
    setRecords((current) => current.filter((record) => record.classId !== classToDelete.id))
    setAttendanceDrafts((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${classToDelete.id}:`))))
    if (selectedClassId === classToDelete.id) setSelectedClassId(remainingClasses[0]?.id ?? '')
    if (historyClassId === classToDelete.id) setHistoryClassId('all')
    notify(`${classToDelete.name} deleted.`)
  }

  const saveAttendance = async (event) => {
    event.preventDefault()
    if (!selectedClass) {
      notify('Add a class and student list first.')
      return
    }
    const absentList = [...new Set(absentNames.split(',').map((name) => name.trim()).filter(Boolean))]
    const absentLookup = new Set(absentList.map((name) => name.toLocaleLowerCase()))
    const rosterNames = new Set(selectedClass.students.map((student) => student.name.toLocaleLowerCase()))
    const unknownNames = absentList.filter((name) => !rosterNames.has(name.toLocaleLowerCase()))
    if (unknownNames.length) {
      notify(`Not in this class list: ${unknownNames.join(', ')}`)
      return
    }

    const studentStatuses = selectedClass.students.map((student) => ({
      ...student,
      status: absentLookup.has(student.name.toLocaleLowerCase()) ? 'absent' : 'present',
    }))
    const presentStudents = studentStatuses.filter((student) => student.status === 'present').length
    const absentStudents = studentStatuses.filter((student) => student.status === 'absent').map((student) => student.name)
    const recordedAt = new Date().toISOString()
    const payload = {
      event: 'attendance_recorded',
      source: 'Presenty',
      recordedAt,
      class: { id: selectedClass.id, name: selectedClass.name },
      attendance: { date: today, totalStudents: studentStatuses.length, presentStudents, absentStudents, status: 'saved' },
      students: studentStatuses,
    }

    setIsSaving(true)
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) throw new Error(`Make returned ${response.status}`)
      const savedRecord = {
        id: newId(),
        classId: selectedClass.id,
        className: selectedClass.name,
        date: today,
        recordedAt,
        totalStudents: studentStatuses.length,
        presentStudents,
        absentStudents,
        studentStatuses,
      }
      setRecords((current) => [savedRecord, ...current.filter((record) => !(record.classId === savedRecord.classId && record.date === today))])
      setAttendanceDrafts((current) => ({ ...current, [draftKey]: '' }))
      notify(`Attendance saved for ${selectedClass.name}.`)
    } catch (error) {
      notify(`Could not save attendance: ${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand"><span className="brand-mark"><Check size={18} strokeWidth={3} /></span><span>presenty</span></div>
      <div className="profile"><div className="avatar">P</div><div><strong>Teacher</strong><span>Attendance workspace</span></div><ChevronDown size={15} /></div>
      <div className="nav-label">Workspace</div>
      <nav>{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${activeView === id ? 'active' : ''}`} onClick={() => changeView(id)}><Icon size={18} /><span>{label}</span>{id === 'today' && <span className="nav-dot" />}</button>)}</nav>
      <div className="class-list"><div className="nav-label">Your classes <span>{classes.length}</span></div>{classes.map((item) => {
        const record = records.find((entry) => entry.classId === item.id && entry.date === today)
        return <div className="class-entry" key={item.id}><button className={`class-link ${selectedClass?.id === item.id ? 'selected' : ''}`} onClick={() => { setSelectedClassId(item.id); changeView('today') }}><i className={`class-color ${item.color}`} /><span>{item.short}</span><em>{record ? `${record.presentStudents}/${record.totalStudents}` : `—/${item.students.length}`}</em></button><button className="class-delete" aria-label={`Delete ${item.name}`} title={`Delete ${item.name}`} onClick={(event) => deleteClass(event, item)}><Trash2 size={14} /></button></div>
      })}</div>
      <div className="sidebar-bottom"><button className="nav-item" onClick={() => changeView('new-class')}><Settings size={18} /><span>Manage classes</span></button><div className="help-card"><ClipboardCheck size={18} /><div><strong>Daily attendance</strong><span>{formatDate(today, { month: 'short', day: 'numeric', year: 'numeric' })}</span></div></div></div>
    </aside>

    <main className="main-content">
      <header className="topbar"><button className="mobile-menu" onClick={() => setMobileNav((open) => !open)} aria-label="Open menu"><Menu size={21} /></button><div className="breadcrumb"><span>Workspace</span><i>/</i><strong>{navItems.find((item) => item.id === activeView)?.label ?? 'Add new class'}</strong></div><div className="top-actions"><span className="today-pill"><span className="live-dot" />{formatDate(today, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span><button className="icon-button" onClick={() => changeView('new-class')} aria-label="Manage classes"><Settings size={18} /></button></div></header>
      {activeView === 'overview' && <Overview today={today} classes={classes} records={todayRecords} present={todaysPresent} total={todaysTotal} go={changeView} selectClass={setSelectedClassId} />}
      {activeView === 'today' && <Today today={today} classes={classes} selectedClass={selectedClass} selectedClassId={selectedClass?.id ?? ''} setSelectedClassId={setSelectedClassId} absentNames={absentNames} setAbsentNames={(value) => setAttendanceDrafts((current) => ({ ...current, [draftKey]: value }))} todayRecord={todayRecord} saveAttendance={saveAttendance} isSaving={isSaving} go={changeView} />}
      {activeView === 'history' && <History classes={classes} records={records} selectedClassId={historyClassId} setSelectedClassId={setHistoryClassId} go={changeView} />}
      {activeView === 'new-class' && <NewClass name={className} setName={setClassName} roster={rosterDraft} setRoster={setRosterDraft} updateRoster={updateRoster} createClass={createClass} />}
      <footer className="page-footer"><span>Presenty <span className="footer-dot">·</span> Attendance for {formatDate(today, { month: 'long', day: 'numeric', year: 'numeric' })}</span><span>Local browser storage</span></footer>
    </main>

    <aside className="chat-panel"><div className="chat-heading"><div><span className="ai-icon"><ClipboardCheck size={15} /></span><div><strong>Today’s register</strong><span>{formatDate(today, { month: 'short', day: 'numeric', year: 'numeric' })}</span></div></div><span className="online-status"><i /> Ready</span></div><div className="chat-stream">{selectedClass ? <><div className="chat-message ai"><p><strong>{selectedClass.name}</strong></p><p>{todayRecord ? `${todayRecord.presentStudents} present · ${todayRecord.absentStudents.length} absent` : 'Attendance has not been saved for this class today.'}</p></div>{todayRecord?.absentStudents.length > 0 && <div className="chat-message teacher"><p>Absent: {todayRecord.absentStudents.join(', ')}</p></div>}</> : <div className="chat-message ai"><p>Add a class and its student list to begin.</p></div>}</div><button className="outline-button" onClick={() => changeView(selectedClass ? 'today' : 'new-class')}>{selectedClass ? 'Open attendance' : 'Add a class'} <ArrowUpRight size={15} /></button></aside>
    {notice && <div className="toast" role="status"><Check size={16} />{notice}<button onClick={() => setNotice('')} aria-label="Close notification"><X size={14} /></button></div>}
  </div>
}

function SectionHeader({ eyebrow, title, copy, action }) {
  return <div className="section-header"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div>{action}</div>
}

function EmptyState({ title, copy, actionLabel, onAction }) {
  return <div className="panel empty-state"><span className="eyebrow">Presenty</span><h2>{title}</h2><p>{copy}</p><button className="primary-button" onClick={onAction}><Plus size={16} />{actionLabel}</button></div>
}

function Overview({ today, classes, records, present, total, go, selectClass }) {
  const percent = total ? Math.round(present / total * 100) : 0
  return <div className="view overview-view"><SectionHeader eyebrow={formatDate(today)} title="Your attendance workspace" copy="Class and daily attendance records entered here." action={<button className="primary-button" onClick={() => go(classes.length ? 'today' : 'new-class')}><ClipboardCheck size={16} />{classes.length ? 'Take attendance' : 'Add a class'}</button>} /><div className="stat-grid"><div className="stat-card highlight"><div className="stat-top"><span>Today's attendance</span><span className="stat-icon"><BarChart3 size={17} /></span></div><strong>{records.length ? percent : '—'}<small>{records.length ? '%' : ''}</small></strong><div className="progress"><span style={{ width: `${percent}%` }} /></div><p>{records.length ? `${present} present of ${total} students` : 'No attendance saved yet'}</p></div><div className="stat-card"><div className="stat-top"><span>Students present today</span><span className="stat-icon green-icon"><Users size={17} /></span></div><strong>{records.length ? present : '—'}<small>{records.length ? `/${total}` : ''}</small></strong><p>{records.length ? `${records.length} class registers saved today` : 'Mark a class register to see totals'}</p></div><div className="stat-card"><div className="stat-top"><span>Your classes</span><span className="stat-icon peach-icon"><GraduationCap size={17} /></span></div><strong>{classes.length}</strong><p>{classes.reduce((sum, item) => sum + item.students.length, 0)} students in saved rosters</p></div></div><div className="overview-grid"><div className="panel today-summary"><div className="panel-title"><div><span className="eyebrow">{formatDate(today, { month: 'long', day: 'numeric', year: 'numeric' })}</span><h2>Today’s class registers</h2></div><button className="text-button" onClick={() => go('history')}>History <ArrowUpRight size={15} /></button></div>{classes.length ? classes.map((item) => {
    const record = records.find((entry) => entry.classId === item.id)
    return <div className="class-row" key={item.id}><div className={`class-badge ${item.color}`}>{item.short}</div><div className="class-row-copy"><strong>{item.name}</strong><span>{record ? `${record.presentStudents} present · ${record.absentStudents.length} absent` : `${item.students.length} students · not marked today`}</span></div><div className="mini-progress"><span style={{ width: `${record && record.totalStudents ? record.presentStudents / record.totalStudents * 100 : 0}%` }} /></div><b>{record ? `${Math.round(record.presentStudents / record.totalStudents * 100)}%` : '—'}</b><button className="class-row-action" aria-label={`Take attendance for ${item.name}`} title={`Take attendance for ${item.name}`} onClick={() => { selectClass(item.id); go('today') }}><ArrowUpRight size={15} /></button></div>
  }) : <p className="empty-copy">No classes yet. Add a class and student list to start.</p>}</div><div className="panel focus-card"><span className="eyebrow">Daily attendance</span><h2>{selectedTitle(classes)}</h2><p>{records.length ? `${records.length} class ${records.length === 1 ? 'register is' : 'registers are'} saved for today.` : 'Attendance is recorded separately for each class and date.'}</p><div className="focus-score"><strong>{formatDate(today, { month: 'short', day: 'numeric' })}</strong><span>{classes.length} {classes.length === 1 ? 'class' : 'classes'}</span></div><button className="outline-button" onClick={() => go(classes.length ? 'today' : 'new-class')}>{classes.length ? 'Open attendance' : 'Add a class'} <ArrowUpRight size={15} /></button></div></div></div>
}

function selectedTitle(classes) {
  return classes.length ? 'Attendance overview' : 'No classes added'
}

function Today({ today, classes, selectedClass, selectedClassId, setSelectedClassId, absentNames, setAbsentNames, todayRecord, saveAttendance, isSaving, go }) {
  if (!classes.length) return <div className="view"><SectionHeader eyebrow={formatDate(today)} title="Today's attendance" copy="Create a class and enter its student list first." /><EmptyState title="No class list yet" copy="Add the class, students, and an optional parent phone number for each student." actionLabel="Add a class" onAction={() => go('new-class')} /></div>
  return <div className="view"><SectionHeader eyebrow={formatDate(today)} title="Today's attendance" copy="Enter absent students' names separated by commas. Everyone else will be marked present." action={<div className="date-card"><span>Today</span><strong>{formatDate(today, { day: 'numeric', month: 'short', year: 'numeric' })}</strong></div>} /><div className="class-switcher"><span>Taking attendance for</span><div className="select-wrap"><GraduationCap size={17} /><select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)}>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={15} /></div></div>{selectedClass && <div className="attendance-layout"><form className="panel attendance-card" onSubmit={saveAttendance}><div className="attendance-card-top"><div><span className="eyebrow">Daily register · {formatDate(today, { month: 'short', day: 'numeric', year: 'numeric' })}</span><h2>Who is absent?</h2></div><span className="student-count"><Users size={15} /> {selectedClass.students.length} students</span></div><label htmlFor="absent-names">Absent students, separated by commas</label><input id="absent-names" className="large-input" value={absentNames} onChange={(event) => setAbsentNames(event.target.value)} placeholder="Enter names from this class list" /><div className="attendance-tip"><Check size={16} /><span><strong>Everyone not listed will be marked present.</strong><br />Names must match the class list. Parent phone numbers are sent with each student's status.</span></div><button className="primary-button save-button" type="submit" disabled={isSaving}><Check size={17} />{isSaving ? 'Sending to Presenty...' : todayRecord ? 'Update today’s attendance' : 'Save today’s attendance'}</button></form><div className="panel attendance-preview"><div className="panel-title"><div><span className="eyebrow">{todayRecord ? 'Saved today' : 'Class list'}</span><h2>{selectedClass.short}</h2></div><span className="status-tag">{todayRecord ? 'Saved' : 'Not saved'}</span></div><div className="attendance-totals"><span>Students <b>{selectedClass.students.length}</b></span><span>Present <b>{todayRecord?.presentStudents ?? '—'}</b></span><span>Absent <b>{todayRecord?.absentStudents.length ?? '—'}</b></span></div>{todayRecord && <div className="absent-list"><span className="eyebrow">Absent today</span><p>{todayRecord.absentStudents.length ? todayRecord.absentStudents.join(', ') : 'No absent students recorded.'}</p></div>}</div></div>}</div>
}

function History({ classes, records, selectedClassId, setSelectedClassId, go }) {
  const visibleRecords = records.filter((record) => selectedClassId === 'all' || record.classId === selectedClassId).sort((left, right) => right.date.localeCompare(left.date))
  const dates = [...new Set(visibleRecords.map((record) => record.date))]
  const studentsByKey = new Map()
  const statusByKey = new Map()

  for (const classItem of classes) {
    if (selectedClassId !== 'all' && classItem.id !== selectedClassId) continue
    for (const student of classItem.students) {
      studentsByKey.set(`${classItem.id}:${student.id}`, { ...student, classId: classItem.id, className: classItem.name })
    }
  }
  for (const record of visibleRecords) {
    for (const student of record.studentStatuses) {
      const studentKey = `${record.classId}:${student.studentId}`
      if (!studentsByKey.has(studentKey)) studentsByKey.set(studentKey, { ...student, id: student.studentId, classId: record.classId, className: record.className })
      statusByKey.set(`${studentKey}:${record.date}`, student.status)
    }
  }
  const students = [...studentsByKey.values()].sort((left, right) => left.className.localeCompare(right.className) || left.rollNumber.localeCompare(right.rollNumber, undefined, { numeric: true }))
  const exportCsv = () => {
    const columns = ['Class', 'Roll', 'Student', ...dates.map((date) => formatDate(date, { year: 'numeric', month: 'short', day: 'numeric' })), 'Present', 'Absent', 'Attendance rate']
    const lines = students.map((student) => {
      const studentKey = `${student.classId}:${student.id}`
      const statuses = dates.map((date) => statusByKey.get(`${studentKey}:${date}`) ?? '')
      const presentCount = statuses.filter((status) => status === 'present').length
      const absentCount = statuses.filter((status) => status === 'absent').length
      const markedCount = presentCount + absentCount
      return [student.className, student.rollNumber, student.name, ...statuses.map((status) => status ? status[0].toUpperCase() : ''), presentCount, absentCount, markedCount ? `${Math.round(presentCount / markedCount * 100)}%` : '']
    })
    const csv = [columns, ...lines].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `presenty-attendance-${dateKey(new Date())}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return <div className="view"><SectionHeader eyebrow="Daily records" title="Attendance history" copy="One row per student, one column per saved date." action={<div className="history-actions"><label className="history-class-filter">Class<select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)}><option value="all">All classes</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{students.length > 0 && <button className="outline-button" onClick={exportCsv}>Export CSV <ArrowUpRight size={14} /></button>}</div>} />{students.length ? <div className="panel history-panel"><div className="table-scroll"><table className="attendance-sheet"><thead><tr><th>Class</th><th>Roll</th><th>Student</th>{dates.map((date) => <th key={date} title={formatDate(date)}>{formatDate(date, { year: 'numeric', month: 'short', day: 'numeric' })}</th>)}<th>Present</th><th>Absent</th><th>Rate</th></tr></thead><tbody>{students.map((student) => {
    const studentKey = `${student.classId}:${student.id}`
    const statuses = dates.map((date) => statusByKey.get(`${studentKey}:${date}`))
    const presentCount = statuses.filter((status) => status === 'present').length
    const absentCount = statuses.filter((status) => status === 'absent').length
    const markedCount = presentCount + absentCount
    return <tr key={studentKey}><td>{student.className}</td><td>{student.rollNumber}</td><td><strong>{student.name}</strong></td>{statuses.map((status, index) => <td key={dates[index]}><span className={`sheet-mark ${status ?? 'unmarked'}`} title={status ?? 'Not recorded'}>{status === 'present' ? 'P' : status === 'absent' ? 'A' : '—'}</span></td>)}<td>{presentCount}</td><td>{absentCount}</td><td>{markedCount ? `${Math.round(presentCount / markedCount * 100)}%` : '—'}</td></tr>
  })}</tbody></table></div><div className="table-footer"><span>{students.length} students · {dates.length} attendance {dates.length === 1 ? 'date' : 'dates'}</span><button className="text-button" onClick={() => go('today')}>Take today’s attendance <ArrowUpRight size={15} /></button></div></div> : <EmptyState title="No attendance records yet" copy="Each day's saved register appears as its own date column here." actionLabel={classes.length ? 'Take attendance' : 'Add a class'} onAction={() => go(classes.length ? 'today' : 'new-class')} />}</div>
}

function NewClass({ name, setName, roster, setRoster, updateRoster, createClass }) {
  return <div className="view new-class-view"><SectionHeader eyebrow="Class setup" title="Add a new class" copy="Enter the class, student names, and optional parent phone numbers." /><form className="panel new-class-form" onSubmit={createClass}><div className="form-heading"><span className="step-number">01</span><div><h2>Class details</h2><p>Use a name you will recognize in daily attendance.</p></div></div><label htmlFor="class-name">Class name</label><input id="class-name" className="large-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. BCA · 2nd Year" required /><div className="form-heading roster-heading"><span className="step-number">02</span><div><h2>Students and parent phone numbers</h2><p>Add one student per row. Phone number is optional.</p></div></div><div className="student-entry-list">{roster.map((student, index) => <div key={index} style={{ display: 'flex', flexWrap: 'wrap', gap: 9, alignItems: 'center', marginBottom: 9 }}><input className="large-input" style={{ flex: '1 1 180px', minWidth: 0 }} aria-label={`Student ${index + 1} name`} value={student.name} onChange={(event) => updateRoster(index, 'name', event.target.value)} placeholder={`Student ${index + 1} full name`} /><input className="large-input" style={{ flex: '1 1 180px', minWidth: 0 }} aria-label={`Student ${index + 1} parent phone`} type="tel" autoComplete="tel" value={student.parentPhone} onChange={(event) => updateRoster(index, 'parentPhone', event.target.value)} placeholder="Parent phone number" /><button type="button" className="outline-button" aria-label={`Remove student ${index + 1}`} onClick={() => setRoster((current) => current.length > 1 ? current.filter((_, row) => row !== index) : [{ name: '', parentPhone: '' }])}><X size={15} /></button></div>)}</div><button type="button" className="text-button" onClick={() => setRoster((current) => [...current, { name: '', parentPhone: '' }])}><Plus size={15} /> Add student</button><button className="primary-button save-button" type="submit"><Check size={17} />Save new class</button></form></div>
}

export default App