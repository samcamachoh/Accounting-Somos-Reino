/* ============================================================
   Somos Reino — strings
   ------------------------------------------------------------
   One table, both languages, every view. The giver portal was
   already bilingual and the leadership pages were not, which
   meant a Spanish-speaking treasurer switched languages by
   switching pages. Now the choice is the person's and it holds
   everywhere.

   Spanish is the default: it is the congregation's first
   language. The choice is remembered in localStorage under
   `sr-lang`.
   ============================================================ */

export const LANGUAGES = ["es", "en"];
const STORAGE_KEY = "sr-lang";

const STRINGS = {
  /* ---- shell ---- */
  appName: { es: "Somos Reino", en: "Somos Reino" },
  signOut: { es: "Cerrar sesión", en: "Sign out" },
  loading: { es: "Cargando…", en: "Loading…" },
  noAccessTitle: { es: "Sin acceso", en: "No access" },
  noAccessBody: {
    es: "Esta cuenta no tiene acceso a esta sección. Habla con un administrador si crees que es un error.",
    en: "This account doesn't have access to this section. Ask an administrator if you think that's a mistake.",
  },
  disabledBody: {
    es: "Esta cuenta fue desactivada. Pide a un administrador que restaure el acceso.",
    en: "This account has been deactivated. Ask an administrator to restore access.",
  },
  modeDemo: { es: "Datos de ejemplo", en: "Demo data" },
  modeReady: { es: "En vivo", en: "Live" },
  modeError: { es: "Error de conexión", en: "Connection error" },

  /* ---- navigation ---- */
  groupMe: { es: "Mi cuenta", en: "Me" },
  groupMoney: { es: "Finanzas", en: "Money" },
  groupChurch: { es: "Iglesia", en: "Church" },
  groupServices: { es: "Servicios", en: "Services" },
  navAccount: { es: "Cuenta", en: "Account" },
  navGive: { es: "Dar", en: "Give" },
  navHistory: { es: "Historial", en: "History" },
  navRecurring: { es: "Recurrente", en: "Recurring" },
  navToday: { es: "Hoy", en: "Today" },
  navReconcile: { es: "Conciliar", en: "Reconcile" },
  navExpenses: { es: "Gastos", en: "Expenses" },
  navGiving: { es: "Aportaciones", en: "Giving" },
  navPeople: { es: "Personas", en: "People" },
  navFunds: { es: "Fondos", en: "Funds" },
  navPlans: { es: "Planes", en: "Plans" },
  navTeams: { es: "Equipos", en: "Teams" },
  navSongs: { es: "Canciones", en: "Songs" },
  navLive: { es: "En vivo", en: "Live" },
  navAccounts: { es: "Cuentas", en: "Accounts" },

  /* ---- sign in ---- */
  signInTitle: { es: "Entrar", en: "Sign in" },
  signInLead: { es: "Entra para dar, ver tu historial y servir.", en: "Sign in to give, see your history, and serve." },
  email: { es: "Correo", en: "Email" },
  password: { es: "Contraseña", en: "Password" },
  signInBtn: { es: "Entrar", en: "Sign in" },
  magicLink: { es: "Enviarme un enlace de acceso", en: "Email me a sign-in link" },
  magicSent: { es: "Enlace enviado. Revisa tu correo.", en: "Link sent. Check your email." },
  forgot: { es: "Olvidé mi contraseña", en: "Forgot my password" },
  resetSent: { es: "Enviamos un enlace para restablecerla.", en: "We sent a link to reset it." },
  choosePassword: { es: "Elige una contraseña nueva", en: "Choose a new password" },
  newPassword: { es: "Contraseña nueva", en: "New password" },
  savePassword: { es: "Guardar contraseña", en: "Save password" },
  passwordSaved: { es: "Contraseña actualizada", en: "Password updated" },
  backToSignIn: { es: "Volver a entrar", en: "Back to sign in" },

  /* ---- account ---- */
  greeting: { es: "Hola, {n}", en: "Hi, {n}" },
  profile: { es: "Perfil", en: "Profile" },
  fullName: { es: "Nombre completo", en: "Full name" },
  phone: { es: "Teléfono", en: "Phone" },
  saveChanges: { es: "Guardar cambios", en: "Save changes" },
  profileSaved: { es: "Perfil guardado", en: "Profile saved" },
  paymentMethods: { es: "Métodos de pago", en: "Payment methods" },
  manageInStripe: { es: "Administrar en Stripe", en: "Manage in Stripe" },
  noCards: { es: "No tienes métodos de pago guardados.", en: "You don't have any saved payment methods." },
  defaultTag: { es: "Predeterminada", en: "Default" },
  notifications: { es: "Avisos", en: "Notifications" },
  notifReceipts: { es: "Recibos por correo", en: "Email receipts" },
  notifReceiptsD: { es: "Un recibo cada vez que das.", en: "A receipt each time you give." },
  notifStatements: { es: "Comprobante anual", en: "Annual statement" },
  notifStatementsD: { es: "Tu resumen deducible en enero.", en: "Your deductible summary each January." },
  notifSchedule: { es: "Recordatorios de servicio", en: "Schedule reminders" },
  notifScheduleD: { es: "Cuando te agendan o cambia un plan.", en: "When you're scheduled or a plan changes." },
  stripeNote: { es: "Las tarjetas se guardan en Stripe, nunca en nuestros servidores.", en: "Cards are stored by Stripe, never on our servers." },

  /* ---- giving ---- */
  chooseFund: { es: "¿A qué fondo?", en: "Which fund?" },
  chooseAmount: { es: "¿Cuánto?", en: "How much?" },
  custom: { es: "Otro", en: "Custom" },
  frequency: { es: "Frecuencia", en: "Frequency" },
  freqOnce: { es: "Una vez", en: "One time" },
  freqWeekly: { es: "Semanal", en: "Weekly" },
  freqMonthly: { es: "Mensual", en: "Monthly" },
  coverFeeT: { es: "Cubrir el costo de procesamiento", en: "Cover the processing fee" },
  coverFeeD: { es: "Agrega {f} para que el 100% llegue al fondo", en: "Adds {f} so 100% reaches the fund" },
  totalToday: { es: "Total de hoy", en: "Total today" },
  giveOnce: { es: "Dar {a} ahora", en: "Give {a} now" },
  giveMonthly: { es: "Empezar {a} al mes", en: "Start {a} monthly" },
  giveWeekly: { es: "Empezar {a} semanal", en: "Start {a} weekly" },
  needAmount: { es: "Elige un monto mayor a cero", en: "Choose an amount above zero" },
  successTitleOnce: { es: "¡Gracias, {n}!", en: "Thank you, {n}!" },
  successBodyOnce: { es: "Tu aportación de {a} a {f} fue recibida.", en: "Your gift of {a} to {f} was received." },
  successBodyRec: { es: "Tu aportación recurrente de {a} a {f} está activa.", en: "Your recurring gift of {a} to {f} is active." },
  viewHistory: { es: "Ver historial", en: "View history" },
  giveAgain: { es: "Dar otra vez", en: "Give again" },
  secured: { es: "Protegido por Stripe · recibirás un recibo por correo", en: "Secured by Stripe · you'll get an email receipt" },
  goalLabel: { es: "{r} de {g}", en: "{r} of {g}" },

  historyTitle: { es: "Historial", en: "History" },
  totalGivenIn: { es: "Total dado en {y}", en: "Total given in {y}" },
  emailStatement: { es: "Enviarme el comprobante de {y}", en: "Email me my {y} statement" },
  statementSent: { es: "Comprobante de {y} enviado por correo", en: "{y} statement emailed" },
  rhythmTitle: { es: "Tu constancia este año", en: "Your rhythm this year" },
  legendGave: { es: "Diste", en: "Gave" },
  legendMissed: { es: "Sin aportación", en: "No gift" },
  legendUpcoming: { es: "Por venir", en: "Upcoming" },
  noGiftsYear: { es: "Sin aportaciones registradas este año.", en: "No gifts recorded this year." },

  recurringTitle: { es: "Recurrente", en: "Recurring" },
  recurringEmpty: { es: "No tienes aportaciones recurrentes activas.", en: "You don't have any active recurring gifts." },
  startRecurring: { es: "Empezar una aportación recurrente", en: "Start a recurring gift" },
  nextCharge: { es: "Próximo cargo", en: "Next charge" },
  pause: { es: "Pausar", en: "Pause" },
  resume: { es: "Reanudar", en: "Resume" },
  editAmt: { es: "Editar monto", en: "Edit amount" },
  pausedTag: { es: "En pausa", en: "Paused" },
  cancelTitle: { es: "¿Cancelar esta aportación recurrente?", en: "Cancel this recurring gift?" },
  cancelBody: { es: "No se harán más cargos. Puedes empezar una nueva cuando quieras.", en: "No further charges will happen. You can start a new one anytime." },
  keepIt: { es: "No, mantenerla", en: "No, keep it" },
  yesCancelIt: { es: "Sí, cancelar", en: "Yes, cancel it" },
  editTitle: { es: "Editar aportación recurrente", en: "Edit recurring gift" },
  newAmount: { es: "Nuevo monto", en: "New amount" },

  /* ---- finance ---- */
  todayTitle: { es: "Buen día, {n}", en: "Good morning, {n}" },
  crumbToday: { es: "Hoy / Resumen", en: "Today / Overview" },
  crumbReconcile: { es: "Finanzas / Conciliación", en: "Money / Reconciliation" },
  crumbExpenses: { es: "Finanzas / Gastos", en: "Money / Expenses" },
  crumbGiving: { es: "Finanzas / Aportaciones vía Stripe", en: "Money / Giving via Stripe" },
  crumbPeople: { es: "Iglesia / Voluntarios y líderes", en: "Church / Volunteers & leaders" },
  crumbFunds: { es: "Iglesia / Cuentas conectadas y fondos", en: "Church / Connected accounts & funds" },
  crumbAccounts: { es: "Iglesia / Administración de cuentas", en: "Church / Account management" },
  crumbPlans: { es: "Servicios / Planes", en: "Services / Plans" },
  crumbTeams: { es: "Servicios / Equipos y posiciones", en: "Services / Teams & positions" },
  crumbSongs: { es: "Servicios / Cancionero", en: "Services / Song library" },
  crumbLive: { es: "Servicios / En vivo", en: "Services / Live" },
  crumbAccount: { es: "Mi cuenta / Perfil", en: "Me / Profile" },
  crumbGive: { es: "Mi cuenta / Dar", en: "Me / Give" },
  crumbHistory: { es: "Mi cuenta / Historial", en: "Me / History" },
  crumbRecurring: { es: "Mi cuenta / Aportaciones recurrentes", en: "Me / Recurring gifts" },

  needsAttention: { es: "Requiere atención", en: "Needs attention" },
  allClear: { es: "Nada pendiente", en: "Nothing pending" },
  allClearD: { es: "Todo está conciliado y aprobado.", en: "Everything is reconciled and approved." },
  unreconciled: { es: "Sin conciliar", en: "Unreconciled" },
  pendingExpenses: { es: "Gastos pendientes", en: "Pending expenses" },
  givingMTD: { es: "Aportaciones del mes", en: "Giving this month" },
  fundBalance: { es: "Saldo de fondos", en: "Fund balance" },
  weeklyGiving: { es: "Aportaciones por semana", en: "Giving by week" },
  activity: { es: "Actividad", en: "Activity" },
  fundsAcross: { es: "Repartido en {n} fondos", en: "Across {n} funds" },
  withFinanceAccess: { es: "{n} con acceso a las finanzas", en: "{n} with finance access" },
  expenseCount: { es: "{n} gastos", en: "{n} expenses" },
  giftCount: { es: "{n} aportaciones", en: "{n} gifts" },
  recurringCount: { es: "{n} recurrentes", en: "{n} recurring" },
  stripePayout: { es: "Depósito de Stripe", en: "Stripe payout" },

  stripePayouts: { es: "Depósitos de Stripe", en: "Stripe payouts" },
  bankDeposits: { es: "Movimientos del banco", en: "Bank transactions" },
  tabOpen: { es: "Abiertos", en: "Open" },
  tabMatched: { es: "Conciliados", en: "Matched" },
  matchThem: { es: "Conciliar", en: "Match these" },
  undo: { es: "Deshacer", en: "Undo" },
  difference: { es: "Diferencia", en: "Difference" },
  matched: { es: "Conciliado", en: "Matched" },
  suggestion: { es: "Sugerencia", en: "Suggested" },
  recordIt: { es: "Registrar", en: "Record it" },
  recordTitle: { es: "Registrar movimiento", en: "Record transaction" },
  recordBody: { es: "No es un depósito de Stripe. Asígnalo a un fondo.", en: "This isn't a Stripe payout. File it against a fund." },
  fund: { es: "Fondo", en: "Fund" },
  category: { es: "Categoría", en: "Category" },
  note: { es: "Nota", en: "Note" },
  openLines: { es: "líneas abiertas", en: "open lines" },
  clearedOf: { es: "{a} de {b} conciliadas", en: "{a} of {b} cleared" },
  exportCsv: { es: "Exportar CSV", en: "Export CSV" },
  noCounterpart: { es: "Sin contraparte en Stripe", en: "No Stripe counterpart" },
  pickOneEach: { es: "Elige uno de cada lado", en: "Pick one from each side" },
  acceptFound: { es: "Aceptar {n} sugeridas", en: "Accept {n} found" },
  clear: { es: "Limpiar", en: "Clear" },
  kindStripe: { es: "Transferencia Stripe", en: "Stripe transfer" },
  kindDeposit: { es: "Depósito en sucursal", en: "Branch deposit" },
  kindOther: { es: "Otro ingreso", en: "Other income" },
  recorded: { es: "Registrado", en: "Recorded" },
  matchedToast: { es: "{a} conciliado contra {b}", en: "{a} reconciled against {b}" },
  acceptedToast: { es: "{n} depósitos conciliados", en: "{n} payouts reconciled" },
  noConfidentMatches: { es: "No quedan coincidencias claras — el resto necesita una persona.", en: "No confident matches left — the rest need a human." },
  recordedToast: { es: "Registrado en {f}", en: "Recorded to {f}" },
  undone: { es: "Deshecho", en: "Undone" },
  nothingReconciledYet: { es: "Nada conciliado todavía", en: "Nothing reconciled yet" },
  nothingReconciledYetD: { es: "Los pares conciliados y los depósitos registrados aparecen aquí.", en: "Matched pairs and recorded deposits land here." },
  attnReconcile: { es: "{n} líneas esperan conciliación", en: "{n} lines waiting to be reconciled" },
  attnReconcileD: { es: "{a} entre Stripe y el banco", en: "{a} across Stripe and the bank" },
  attnExpenses: { es: "{n} gastos necesitan una decisión", en: "{n} expenses need a decision" },
  attnExpensesD: { es: "{a} presentados por líderes de equipo", en: "{a} submitted by team leads" },
  attnBackground: { es: "{n} sin verificación de antecedentes al día", en: "{n} missing a current background check" },
  nothingToReconcile: { es: "Todo conciliado", en: "All reconciled" },
  nothingToReconcileD: { es: "Cada depósito tiene su movimiento.", en: "Every payout has its transaction." },

  statusPending: { es: "Pendiente", en: "Pending" },
  statusApproved: { es: "Aprobado", en: "Approved" },
  statusDenied: { es: "Rechazado", en: "Denied" },
  statusReimbursed: { es: "Reembolsado", en: "Reimbursed" },
  statusAll: { es: "Todos", en: "All" },
  approve: { es: "Aprobar", en: "Approve" },
  deny: { es: "Rechazar", en: "Deny" },
  markReimbursed: { es: "Marcar reembolsado", en: "Mark reimbursed" },
  newExpense: { es: "Nuevo gasto", en: "New expense" },
  description: { es: "Descripción", en: "Description" },
  amount: { es: "Monto", en: "Amount" },
  team: { es: "Equipo", en: "Team" },
  submittedBy: { es: "Presentado por", en: "Submitted by" },
  noReceipt: { es: "Sin recibo", en: "No receipt" },
  denyTitle: { es: "Rechazar este gasto", en: "Deny this expense" },
  denyReason: { es: "Motivo", en: "Reason" },
  denyReasonPlaceholder: { es: "El solicitante verá esto.", en: "The submitter will see this." },
  expenseFiled: { es: "Gasto presentado", en: "Expense filed" },
  expenseApproved: { es: "Aprobado {d} — {a}", en: "Approved {d} — {a}" },
  expenseReimbursed: { es: "{n} recibirá {a}", en: "{n} will be reimbursed {a}" },
  expenseDenied: { es: "Gasto rechazado", en: "Expense denied" },
  noExpenses: { es: "Sin gastos", en: "No expenses" },
  noExpensesD: { es: "Nada coincide con este filtro.", en: "Nothing matches this filter." },

  allFunds: { es: "Todos los fondos", en: "All funds" },
  allMethods: { es: "Todos los métodos", en: "All methods" },
  giver: { es: "Quien dio", en: "Giver" },
  method: { es: "Método", en: "Method" },
  date: { es: "Fecha", en: "Date" },
  fees: { es: "Comisiones", en: "Fees" },
  net: { es: "Neto", en: "Net" },
  gross: { es: "Bruto", en: "Gross" },
  recurringTag: { es: "Recurrente", en: "Recurring" },
  feesCovered: { es: "Comisión cubierta", en: "Fee covered" },
  noGifts: { es: "Sin aportaciones", en: "No gifts" },
  noGiftsD: { es: "Nada coincide con este filtro.", en: "Nothing matches this filter." },

  searchPeople: { es: "Buscar por nombre o correo", en: "Search by name or email" },
  allRoles: { es: "Todos los roles", en: "All roles" },
  active: { es: "Activos", en: "Active" },
  inactive: { es: "Inactivos", en: "Inactive" },
  permissions: { es: "Permisos", en: "Permissions" },
  permFinance: { es: "Ver las finanzas", en: "See the books" },
  permFinanceD: { es: "Conciliación, gastos y aportaciones de toda la iglesia.", en: "Reconciliation, expenses, and giving across the church." },
  permApprove: { es: "Aprobar gastos", en: "Approve expenses" },
  permApproveD: { es: "Mover un reembolso por su aprobación.", en: "Move a reimbursement through approval." },
  permRefund: { es: "Emitir reembolsos", en: "Issue refunds" },
  permRefundD: { es: "Devolver una aportación vía Stripe.", en: "Return a gift through Stripe." },
  permPeople: { es: "Administrar personas", en: "Manage people" },
  permPeopleD: { es: "Editar el directorio y los equipos.", en: "Edit the roster and teams." },
  permPayouts: { es: "Cuentas y fondos", en: "Accounts & funds" },
  permPayoutsD: { es: "Cuentas conectadas y configuración de fondos.", en: "Connected accounts and fund setup." },
  selectPerson: { es: "Elige a alguien", en: "Pick someone" },
  selectPersonD: { es: "Elige a alguien de la lista para ver sus permisos.", en: "Choose a name to see their permissions." },
  noPeople: { es: "Sin resultados", en: "No matches" },
  noPeopleD: { es: "Nadie coincide con esta búsqueda.", en: "Nobody matches this search." },
  backgroundCheck: { es: "Verificación", en: "Background check" },
  bgCleared: { es: "Al día", en: "Cleared" },
  bgExpiring: { es: "Por vencer", en: "Expiring" },
  bgMissing: { es: "Falta", en: "Missing" },
  memberSince: { es: "Miembro desde {y}", en: "Member since {y}" },
  lastSeen: { es: "Visto {t}", en: "Seen {t}" },

  connectedAccounts: { es: "Cuentas conectadas", en: "Connected accounts" },
  fundSetup: { es: "Fondos", en: "Funds" },
  balance: { es: "Saldo", en: "Balance" },
  connected: { es: "Conectada", en: "Connected" },
  noFunds: { es: "Sin fondos configurados", en: "No funds configured" },
  connStripe: { es: "Aportaciones en línea, recibos y depósitos semanales.", en: "Online giving, receipts, and weekly payouts." },
  connBank: { es: "Cuenta de cheques que recibe los depósitos.", en: "The checking account the payouts land in." },
  connSupabase: { es: "Base de datos, cuentas y permisos.", en: "Database, accounts, and permissions." },
  permGranted: { es: "{n} ahora puede {p}", en: "{n} can now {p}" },
  permRevoked: { es: "{n} ya no puede {p}", en: "{n} can no longer {p}" },

  /* ---- account management ---- */
  addPerson: { es: "Agregar persona", en: "Add person" },
  editPerson: { es: "Editar persona", en: "Edit person" },
  role: { es: "Rol", en: "Role" },
  roleAdmin: { es: "Administrador", en: "Admin" },
  roleFinance: { es: "Finanzas", en: "Finance" },
  roleStaff: { es: "Personal", en: "Staff" },
  roleMember: { es: "Miembro", en: "Member" },
  setPassword: { es: "Poner contraseña", en: "Set password" },
  sendReset: { es: "Enviar enlace de restablecimiento", en: "Send reset link" },
  resetEmailed: { es: "Enlace enviado a {e}", en: "Reset link sent to {e}" },
  deactivate: { es: "Desactivar", en: "Deactivate" },
  reactivate: { es: "Reactivar", en: "Reactivate" },
  deleteTitle: { es: "¿Eliminar a {n}?", en: "Delete {n}?" },
  deleteBody: {
    es: "Esto borra la cuenta para siempre. Desactivarla conserva el historial contable.",
    en: "This removes the account for good. Deactivating keeps the accounting history whole.",
  },
  deleteConfirm: { es: "Sí, eliminar", en: "Yes, delete" },
  inviteNote: { es: "Deja la contraseña en blanco para enviar una invitación.", en: "Leave the password blank to email an invitation instead." },
  personAdded: { es: "Cuenta creada", en: "Account created" },
  personSaved: { es: "Cambios guardados", en: "Changes saved" },
  personDeleted: { es: "Cuenta eliminada", en: "Account deleted" },
  cannotSelfDeactivate: { es: "No puedes desactivar tu propia cuenta.", en: "You can't deactivate your own account." },
  personDeactivated: { es: "{n} ya no puede entrar", en: "{n} can no longer sign in" },
  personReactivated: { es: "La cuenta de {n} está activa otra vez", en: "{n}'s account is active again" },
  passwordTooShort: { es: "La contraseña debe tener al menos 8 caracteres.", en: "Password must be at least 8 characters." },
  emailRequired: { es: "Esta cuenta no tiene correo.", en: "This account has no email address." },
  deleteInBooks: { es: "Esta persona aparece en los libros. Confirma otra vez para eliminarla.", en: "This person appears in the books. Confirm again to delete." },
  seen: { es: "Visto", en: "Seen" },
  never: { es: "nunca", en: "never" },
  you: { es: "tú", en: "you" },

  /* ---- services ---- */
  myRequests: { es: "Tus invitaciones", en: "Your invitations" },
  accept: { es: "Aceptar", en: "Accept" },
  decline: { es: "No puedo", en: "Decline" },
  accepted: { es: "Aceptado", en: "Accepted" },
  declined: { es: "Rechazado", en: "Declined" },
  invited: { es: "Invitado", en: "Invited" },
  openSlots: { es: "{n} posiciones abiertas", en: "{n} open spots" },
  noOpenSlots: { es: "Equipo completo", en: "Team is full" },
  orderOfService: { es: "Orden del servicio", en: "Order of service" },
  runningTime: { es: "Duración", en: "Running time" },
  songKey: { es: "Tono", en: "Key" },
  lastPlayed: { es: "Última vez", en: "Last played" },
  startService: { es: "Empezar el servicio", en: "Start the service" },
  stopService: { es: "Terminar", en: "Stop" },
  nextItem: { es: "Siguiente", en: "Next" },
  noPlans: { es: "Sin planes de servicio", en: "No service plans" },
  noTeams: { es: "Sin equipos", en: "No teams" },
  noSongs: { es: "Sin canciones", en: "No songs" },
  plays: { es: "Veces", en: "Plays" },
  openSpot: { es: "Posición abierta", en: "Open spot" },
  scheduled: { es: "Agendado", en: "Scheduled" },
  allSet: { es: "{a} de {b} listos", en: "{a} of {b} set" },
  scheduleMatrix: { es: "Matriz de programación", en: "Scheduling matrix" },
  onTime: { es: "A tiempo", en: "On time" },
  runningLong: { es: "{t} de retraso", en: "{t} long" },
  runningShort: { es: "{t} de adelanto", en: "{t} short" },
  servicesDemoNote: {
    es: "Los servicios aún no tienen tablas en Supabase, así que esta sección siempre muestra datos de ejemplo.",
    en: "Services has no Supabase tables yet, so this section always shows sample data.",
  },

  /* ---- shared verbs ---- */
  save: { es: "Guardar", en: "Save" },
  cancelBtn: { es: "Cancelar", en: "Cancel" },
  add: { es: "Agregar", en: "Add" },
  edit: { es: "Editar", en: "Edit" },
  remove: { es: "Quitar", en: "Remove" },
  all: { es: "Todos", en: "All" },
  search: { es: "Buscar", en: "Search" },
};

/* The language the whole app renders in. Read through lang(), set
   through setLang() — the router re-renders when it changes. */
let current = "es";

/** Restore the remembered choice. Called once, at boot. */
export function initLang() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (LANGUAGES.includes(stored)) current = stored;
  } catch {
    /* Private browsing denies localStorage; the default is fine. */
  }
  document.documentElement.lang = current;
  return current;
}

export const lang = () => current;

export function setLang(next) {
  if (!LANGUAGES.includes(next)) return current;
  current = next;
  document.documentElement.lang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* Remembering is a convenience, not a requirement. */
  }
  return current;
}

/**
 * Look up a string, filling {placeholders} from `values`.
 * An unknown key returns itself, which makes a missing string
 * obvious on screen instead of rendering as blank.
 */
export function t(key, values) {
  let text = STRINGS[key]?.[current] ?? STRINGS[key]?.en ?? key;
  if (values) {
    for (const [name, value] of Object.entries(values)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}
