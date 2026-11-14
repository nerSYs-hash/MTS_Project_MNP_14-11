import React, { useState } from 'react';
import { X, UserCheck, Lock, User, Eye, EyeOff, CheckCircle2, LogOut, Users } from 'lucide-react';
import { loadUrmSyncConfig, saveUrmSyncConfig } from '../utils/urmStatSync';

export interface SupervisorAccount {
  login: string;
  password: string;
  fullName?: string;
  groupLeaderName?: string;
  createdAt?: number;
}

interface SupervisorAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSession: SupervisorAccount | null;
  onLoginSuccess: (account: SupervisorAccount) => void;
  onLogout: () => void;
}

type ModalTab = 'login' | 'register';

const STORAGE_ACCOUNTS_LIST_KEY = 'mts_supervisor_accounts_list_v1';
const STORAGE_ACTIVE_SESSION_KEY = 'mts_urm_active_account_session_v1';

export function loadAccounts(): SupervisorAccount[] {
  try {
    const raw = localStorage.getItem(STORAGE_ACCOUNTS_LIST_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return [];
}

export function saveAccounts(accounts: SupervisorAccount[]) {
  try {
    localStorage.setItem(STORAGE_ACCOUNTS_LIST_KEY, JSON.stringify(accounts));
  } catch {
    // ignore
  }
}

export function loadActiveAccountSession(): SupervisorAccount | null {
  try {
    const raw = localStorage.getItem(STORAGE_ACTIVE_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.login === 'string') {
        return parsed as SupervisorAccount;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function saveActiveAccountSession(account: SupervisorAccount | null) {
  try {
    if (account) {
      localStorage.setItem(STORAGE_ACTIVE_SESSION_KEY, JSON.stringify(account));
    } else {
      localStorage.removeItem(STORAGE_ACTIVE_SESSION_KEY);
    }
  } catch {
    // ignore
  }
}

function syncAccountToUrmConfig(account: SupervisorAccount) {
  const currentCfg = loadUrmSyncConfig();
  saveUrmSyncConfig({
    ...currentCfg,
    enabled: true,
    operatorId: account.login.trim(),
    operatorName: (account.fullName || account.login).trim(),
    groupLeaderName: (account.groupLeaderName || currentCfg.groupLeaderName || '').trim(),
  });
}

export const SupervisorAccessModal: React.FC<SupervisorAccessModalProps> = ({
  isOpen,
  onClose,
  activeSession,
  onLoginSuccess,
  onLogout,
}) => {
  const [accounts, setAccounts] = useState<SupervisorAccount[]>(() => loadAccounts());
  const [activeTab, setActiveTab] = useState<ModalTab>('login');

  // Поля входа
  const [loginInput, setLoginInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Поля регистрации
  const [regFullName, setRegFullName] = useState('');
  const [regLogin, setRegLogin] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regGroupLeader, setRegGroupLeader] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmedLogin = loginInput.trim();
    const trimmedPass = passwordInput.trim();

    if (!trimmedLogin || !trimmedPass) {
      setErrorMsg('Введите логин и пароль');
      return;
    }

    const currentAccounts = loadAccounts();
    const matched = currentAccounts.find(
      (acc) =>
        acc.login.toLowerCase() === trimmedLogin.toLowerCase() && acc.password === trimmedPass
    );

    if (!matched) {
      setErrorMsg('Неверный логин или пароль (либо аккаунт ещё не зарегистрирован)');
      return;
    }

    saveActiveAccountSession(matched);
    syncAccountToUrmConfig(matched);
    onLoginSuccess(matched);
    setLoginInput('');
    setPasswordInput('');
    onClose();
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmedFullName = regFullName.trim();
    const trimmedLogin = regLogin.trim();
    const trimmedPass = regPassword.trim();
    const trimmedLeader = regGroupLeader.trim();

    if (!trimmedLogin || !trimmedPass) {
      setErrorMsg('Заполните логин и пароль');
      return;
    }

    const newAccount: SupervisorAccount = {
      login: trimmedLogin,
      password: trimmedPass,
      fullName: trimmedFullName || trimmedLogin,
      groupLeaderName: trimmedLeader || undefined,
      createdAt: Date.now(),
    };

    const currentAccounts = loadAccounts();
    const existingIdx = currentAccounts.findIndex(
      (a) => a.login.toLowerCase() === trimmedLogin.toLowerCase()
    );
    const nextAccounts =
      existingIdx >= 0
        ? currentAccounts.map((a, i) => (i === existingIdx ? newAccount : a))
        : [...currentAccounts, newAccount];

    setAccounts(nextAccounts);
    saveAccounts(nextAccounts);
    saveActiveAccountSession(newAccount);
    syncAccountToUrmConfig(newAccount);
    onLoginSuccess(newAccount);
    setRegFullName('');
    setRegLogin('');
    setRegPassword('');
    setRegGroupLeader('');
    setSuccessMsg('Аккаунт создан и вход выполнен! Все логи привязаны к вашему профилю.');
    setTimeout(() => {
      onClose();
    }, 650);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] flex items-center justify-center p-4 animate-in fade-in duration-150 font-mts-compact">
      <div className="relative w-full max-w-[460px] bg-white rounded-[28px] border border-[#EBECEF] shadow-2xl flex flex-col overflow-hidden">
        {/* Шапка окна */}
        <div className="px-6 pt-5 pb-4 border-b border-[#F2F3F7] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-red-50 text-[#E30613] flex items-center justify-center shrink-0">
              <UserCheck className="w-5 h-5 stroke-[2]" />
            </div>
            <div>
              <h2 className="text-lg font-black text-[#1D2023] font-mts-extended leading-tight">
                Аккаунт УРМ
              </h2>
              <p className="text-[11px] text-[#626C77]">
                Вход и регистрация сотрудника в системе
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть окно аккаунта"
            className="w-9 h-9 rounded-full bg-[#F2F3F7] hover:bg-[#E5E7EB] text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4 stroke-[1.75]" />
          </button>
        </div>

        {/* Если сессия уже активна — показываем статус и кнопку выхода */}
        {activeSession && (
          <div className="mx-6 mt-5 p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="truncate">
                <div className="text-xs font-bold text-[#1D2023] truncate">
                  {activeSession.fullName || activeSession.login}
                </div>
                <div className="text-[11px] text-[#626C77] truncate">
                  Логин: {activeSession.login}
                  {activeSession.groupLeaderName ? ` • РГ/ВС: ${activeSession.groupLeaderName}` : ''}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                saveActiveAccountSession(null);
                onLogout();
              }}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-rose-50 text-[#E30613] border border-emerald-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Выйти</span>
            </button>
          </div>
        )}

        {/* Переключатель Вход / Регистрация */}
        <div className="px-6 pt-5">
          <div className="bg-[#F2F3F7] p-1.5 rounded-2xl grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => {
                setActiveTab('login');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`py-2.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'login'
                  ? 'bg-white text-[#1D2023] shadow-2xs'
                  : 'text-[#626C77] hover:text-[#1D2023]'
              }`}
            >
              Вход
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('register');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`py-2.5 px-3 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'register'
                  ? 'bg-white text-[#1D2023] shadow-2xs'
                  : 'text-[#626C77] hover:text-[#1D2023]'
              }`}
            >
              Регистрация
            </button>
          </div>
        </div>

        {/* Тело формы */}
        {activeTab === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#626C77] mb-1.5">
                Логин УРМ
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#8C95A0] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={loginInput}
                  onChange={(e) => setLoginInput(e.target.value)}
                  placeholder="Например: iivanov"
                  autoFocus
                  className="w-full h-11 pl-10 pr-4 rounded-2xl bg-[#F2F3F7] focus:bg-white border border-transparent focus:border-[#D5D8DD] text-xs font-semibold text-[#1D2023] placeholder:text-[#8C95A0] focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#626C77] mb-1.5">
                Пароль
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#8C95A0] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Введите пароль"
                  className="w-full h-11 pl-10 pr-10 rounded-2xl bg-[#F2F3F7] focus:bg-white border border-transparent focus:border-[#D5D8DD] text-xs font-semibold text-[#1D2023] placeholder:text-[#8C95A0] focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C95A0] hover:text-[#1D2023] cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {accounts.length === 0 && (
              <div className="text-[11px] text-[#626C77] bg-[#F8F9FB] px-3.5 py-2.5 rounded-xl border border-[#EBECEF]">
                Если вы входите впервые — переключитесь на вкладку{' '}
                <button
                  type="button"
                  onClick={() => setActiveTab('register')}
                  className="text-[#E30613] font-bold hover:underline cursor-pointer"
                >
                  Регистрация
                </button>{' '}
                и создайте свой профиль.
              </div>
            )}

            {errorMsg && (
              <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-[#E30613]">
                {errorMsg}
              </div>
            )}

            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-12 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer"
              >
                ОТМЕНА
              </button>
              <button
                type="submit"
                className="flex-1 h-12 rounded-full bg-[#FF0023] hover:bg-[#E30613] text-white text-xs font-bold uppercase tracking-wide transition-colors shadow-sm cursor-pointer"
              >
                ВОЙТИ
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegisterSubmit} className="p-6 space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-[#626C77] mb-1.5">
                Имя и Фамилия
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#8C95A0] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={regFullName}
                  onChange={(e) => setRegFullName(e.target.value)}
                  placeholder="Например: Иван Иванов"
                  autoFocus
                  className="w-full h-11 pl-10 pr-4 rounded-2xl bg-[#F2F3F7] focus:bg-white border border-transparent focus:border-[#D5D8DD] text-xs font-semibold text-[#1D2023] placeholder:text-[#8C95A0] focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#626C77] mb-1.5">
                Логин для входа (или логин УРМ)
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-[#8C95A0] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={regLogin}
                  onChange={(e) => setRegLogin(e.target.value)}
                  placeholder="Например: iivanov"
                  className="w-full h-11 pl-10 pr-4 rounded-2xl bg-[#F2F3F7] focus:bg-white border border-transparent focus:border-[#D5D8DD] text-xs font-semibold text-[#1D2023] placeholder:text-[#8C95A0] focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#626C77] mb-1.5">
                Ваш ВС / РГ (необязательно)
              </label>
              <div className="relative">
                <Users className="w-4 h-4 text-[#8C95A0] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={regGroupLeader}
                  onChange={(e) => setRegGroupLeader(e.target.value)}
                  placeholder="Например: Андрей Андреевич"
                  className="w-full h-11 pl-10 pr-4 rounded-2xl bg-[#F2F3F7] focus:bg-white border border-transparent focus:border-[#D5D8DD] text-xs font-semibold text-[#1D2023] placeholder:text-[#8C95A0] focus:outline-none transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#626C77] mb-1.5">
                Придумайте пароль
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#8C95A0] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type={showRegPassword ? 'text' : 'password'}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Пароль для входа"
                  className="w-full h-11 pl-10 pr-10 rounded-2xl bg-[#F2F3F7] focus:bg-white border border-transparent focus:border-[#D5D8DD] text-xs font-semibold text-[#1D2023] placeholder:text-[#8C95A0] focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowRegPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C95A0] hover:text-[#1D2023] cursor-pointer"
                >
                  {showRegPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-[#E30613]">
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
                {successMsg}
              </div>
            )}

            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 h-12 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer"
              >
                ОТМЕНА
              </button>
              <button
                type="submit"
                className="flex-1 h-12 rounded-full bg-[#FF0023] hover:bg-[#E30613] text-white text-xs font-bold uppercase tracking-wide transition-colors shadow-sm cursor-pointer"
              >
                СОХРАНИТЬ
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
