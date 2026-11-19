import React, { useState, useRef } from 'react';
import { X, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { loadUrmSyncConfig, saveUrmSyncConfig } from '../utils/urmStatSync';
import { saveSenderNameToStorage } from '../utils/cardSharing';

export type PinLength = 4;

export interface SupervisorAccount {
  login: string;
  password: string;
  fullName?: string;
  groupLeaderName?: string;
  secretPin?: string;
  pinLength?: number;
  createdAt?: number;
}

interface SupervisorAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeSession: SupervisorAccount | null;
  onLoginSuccess: (account: SupervisorAccount) => void;
  onLogout: () => void;
  requireAuth?: boolean;
  onSecretDevCode?: () => void;
}

type ModalTab = 'login' | 'register' | 'reset_password' | 'reset_pin';
type LoginMethod = 'password' | 'pin';

const PIN_CELLS_COUNT = 4;

const STORAGE_ACCOUNTS_LIST_KEY = 'mts_supervisor_accounts_list_v1';
const STORAGE_ACTIVE_SESSION_KEY = 'mts_urm_active_account_session_v1';
const STORAGE_RESET_LOCKOUT_KEY = 'mts_profile_reset_lockout_v1';
const STORAGE_USER_PREFS_PREFIX = 'mts_user_personal_prefs_v1_';

const TRACKED_PERSONAL_STORAGE_KEYS = [
  'mts_retention_settings_v1',
  'mts_urm_stat_sync_config_v1',
  'mts_group_kpi_targets_v1',
  'mts_shift_stats_col_widths_v7',
  'mts_shift_stats_visible_cols_v1',
  'mts_saved_table_expanded',
  'mts_urm_dev_branch_mode',
  'mts_pearl_dock_pos_v1',
];

export function savePersonalSettingsSnapshotForUser(login: string): void {
  if (!login || typeof window === 'undefined') return;
  try {
    const key = `${STORAGE_USER_PREFS_PREFIX}${login.trim().toLowerCase()}`;
    const snapshot: Record<string, string> = {};
    for (const storageKey of TRACKED_PERSONAL_STORAGE_KEYS) {
      const val = localStorage.getItem(storageKey);
      if (val !== null) {
        snapshot[storageKey] = val;
      }
    }
    localStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    // ignore
  }
}

export function restorePersonalSettingsSnapshotForUser(login: string): boolean {
  if (!login || typeof window === 'undefined') return false;
  try {
    const key = `${STORAGE_USER_PREFS_PREFIX}${login.trim().toLowerCase()}`;
    const raw = localStorage.getItem(key);
    if (!raw) return false;
    const snapshot = JSON.parse(raw) as Record<string, string>;
    if (!snapshot || typeof snapshot !== 'object') return false;
    for (const [storageKey, val] of Object.entries(snapshot)) {
      if (typeof val === 'string') {
        localStorage.setItem(storageKey, val);
      }
    }
    return true;
  } catch {
    return false;
  }
}

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

export function syncAccountToUrmConfig(account: SupervisorAccount) {
  const displayName = (account.fullName || account.login).trim();
  const currentCfg = loadUrmSyncConfig();
  saveUrmSyncConfig({
    ...currentCfg,
    enabled: true,
    operatorId: account.login.trim(),
    operatorName: displayName,
    groupLeaderName: (account.groupLeaderName || currentCfg.groupLeaderName || '').trim(),
  });
  saveSenderNameToStorage(displayName);
  savePersonalSettingsSnapshotForUser(account.login);
}

/**
 * Компонент 4 ячеек под каждую цифру ПИН-кода в фирменном стиле МТС без черной обводки
 */
const PinCellsInput: React.FC<{
  value: string;
  onChange: (nextVal: string) => void;
  masked?: boolean;
}> = ({ value, onChange, masked = false }) => {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const length = PIN_CELLS_COUNT;

  const digits = Array.from({ length }, (_, idx) => value[idx] || '');

  const handleCellChange = (idx: number, raw: string) => {
    const clean = raw.replace(/\D/g, '');
    if (!clean) {
      const nextArr = [...digits];
      nextArr[idx] = '';
      onChange(nextArr.join(''));
      return;
    }

    const nextArr = [...digits];
    for (let i = 0; i < clean.length && idx + i < length; i++) {
      nextArr[idx + i] = clean[i];
    }
    const joined = nextArr.slice(0, length).join('');
    onChange(joined);

    const nextFocusIdx = Math.min(length - 1, idx + clean.length);
    inputRefs.current[nextFocusIdx]?.focus();
    inputRefs.current[nextFocusIdx]?.select();
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (digits[idx]) {
        const nextArr = [...digits];
        nextArr[idx] = '';
        onChange(nextArr.join(''));
      } else if (idx > 0) {
        const nextArr = [...digits];
        nextArr[idx - 1] = '';
        onChange(nextArr.join(''));
        inputRefs.current[idx - 1]?.focus();
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      e.preventDefault();
      inputRefs.current[idx - 1]?.focus();
    } else if (e.key === 'ArrowRight' && idx < length - 1) {
      e.preventDefault();
      inputRefs.current[idx + 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    onChange(pasted);
    const focusIdx = Math.min(length - 1, pasted.length);
    inputRefs.current[focusIdx]?.focus();
  };

  return (
    <div className="grid grid-cols-4 gap-2.5">
      {digits.map((digit, idx) => (
        <input
          key={idx}
          ref={(el) => {
            inputRefs.current[idx] = el;
          }}
          type={masked ? 'password' : 'text'}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={2}
          value={digit}
          onChange={(e) => handleCellChange(idx, e.target.value)}
          onKeyDown={(e) => handleKeyDown(idx, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={`Цифра ПИН-кода ${idx + 1}`}
          className={`w-full h-11 text-lg text-center font-black rounded-2xl transition-all focus:outline-none tabular-nums ${
            digit
              ? 'bg-white border border-[#D5D8DD] text-[#1D2023] shadow-2xs focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30'
              : 'bg-[#F2F3F7] border border-[#D5D8DD]/70 text-[#1D2023] focus:bg-white focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30'
          }`}
        />
      ))}
    </div>
  );
};

export const SupervisorAccessModal: React.FC<SupervisorAccessModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  requireAuth = false,
  onSecretDevCode,
}) => {
  const [accounts, setAccounts] = useState<SupervisorAccount[]>(() => loadAccounts());
  const [activeTab, setActiveTab] = useState<ModalTab>('login');
  // Приоритет по умолчанию — Пароль, затем Быстрый вход ПИН
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('password');

  // Поля входа
  const [loginInput, setLoginInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [loginPinInput, setLoginPinInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showLoginPin, setShowLoginPin] = useState(false);

  // Поля регистрации (в один столбик)
  const [regFullName, setRegFullName] = useState('');
  const [regLogin, setRegLogin] = useState('');
  const [regGroupLeader, setRegGroupLeader] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regSecretPin, setRegSecretPin] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegPin, setShowRegPin] = useState(true);

  // Восстановление пароля по ПИН-коду («Забыли пароль?»)
  const [resetLogin, setResetLogin] = useState('');
  const [resetSecretPin, setResetSecretPin] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);

  // Восстановление ПИН-кода по Паролю («Забыли ПИН-код?»)
  const [recoverPinLogin, setRecoverPinLogin] = useState('');
  const [recoverPinPassword, setRecoverPinPassword] = useState('');
  const [recoverNewPin, setRecoverNewPin] = useState('');
  const [showRecoverPassword, setShowRecoverPassword] = useState(false);

  const [failedResetCount, setFailedResetCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen && !requireAuth) return null;

  const getLockoutRemainingSeconds = (): number => {
    try {
      const raw = localStorage.getItem(STORAGE_RESET_LOCKOUT_KEY);
      if (raw) {
        const until = Number(raw);
        if (until > Date.now()) {
          return Math.ceil((until - Date.now()) / 1000);
        }
      }
    } catch {
      // ignore
    }
    return 0;
  };

  const completeLoginSession = (matched: SupervisorAccount) => {
    restorePersonalSettingsSnapshotForUser(matched.login);
    saveActiveAccountSession(matched);
    syncAccountToUrmConfig(matched);
    onLoginSuccess(matched);
    setLoginInput('');
    setPasswordInput('');
    setLoginPinInput('');
    onClose();
  };

  const checkAndTriggerDevCode = (val: string): boolean => {
    const digits = val.replace(/\D/g, '');
    if (digits === '79293664010' || (digits.length >= 10 && digits.endsWith('9293664010'))) {
      if (onSecretDevCode) {
        onSecretDevCode();
        setLoginInput('');
        setPasswordInput('');
        setLoginPinInput('');
        return true;
      }
    }
    return false;
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmedLogin = loginInput.trim();
    if (checkAndTriggerDevCode(trimmedLogin) || checkAndTriggerDevCode(passwordInput)) {
      return;
    }

    if (!trimmedLogin) {
      setErrorMsg('Введите ваш логин');
      return;
    }

    const currentAccounts = loadAccounts();
    const accountByLogin = currentAccounts.find(
      (acc) => acc.login.toLowerCase() === trimmedLogin.toLowerCase()
    );

    if (!accountByLogin) {
      setErrorMsg('Профиль с таким логином не найден. Перейдите во вкладку «Регистрация».');
      return;
    }

    if (loginMethod === 'password') {
      const trimmedPass = passwordInput.trim();
      if (!trimmedPass) {
        setErrorMsg('Введите пароль');
        return;
      }
      if (accountByLogin.password !== trimmedPass) {
        setErrorMsg('Неверный пароль. Если забыли пароль — нажмите «Забыли пароль?»');
        return;
      }
      completeLoginSession(accountByLogin);
    } else {
      const cleanPin = loginPinInput.replace(/\D/g, '');
      if (cleanPin.length !== PIN_CELLS_COUNT) {
        setErrorMsg(`Введите все ${PIN_CELLS_COUNT} цифры вашего ПИН-кода`);
        return;
      }
      if (!accountByLogin.secretPin || accountByLogin.secretPin.slice(0, PIN_CELLS_COUNT) !== cleanPin) {
        setErrorMsg('Неверный ПИН-код. Если забыли ПИН-код — нажмите «Забыли ПИН-код?»');
        return;
      }
      completeLoginSession(accountByLogin);
    }
  };

  const handleRegisterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmedFullName = regFullName.trim();
    const trimmedLogin = regLogin.trim();
    const trimmedPass = regPassword.trim();
    const trimmedLeader = regGroupLeader.trim();
    const cleanPin = regSecretPin.replace(/\D/g, '');

    if (!trimmedLogin || !trimmedPass) {
      setErrorMsg('Заполните логин и пароль');
      return;
    }

    if (cleanPin.length > 0 && cleanPin.length !== PIN_CELLS_COUNT) {
      setErrorMsg(`Заполните все ${PIN_CELLS_COUNT} ячейки ПИН-кода или оставьте поле пустым`);
      return;
    }

    const currentAccounts = loadAccounts();
    const existingAccount = currentAccounts.find(
      (a) => a.login.toLowerCase() === trimmedLogin.toLowerCase()
    );

    if (
      existingAccount &&
      existingAccount.password &&
      existingAccount.password !== trimmedPass &&
      (!cleanPin || existingAccount.secretPin !== cleanPin)
    ) {
      setErrorMsg(
        'Этот логин уже зарегистрирован. Используйте «Вход» или «Забыли пароль?»'
      );
      return;
    }

    const newAccount: SupervisorAccount = {
      login: trimmedLogin,
      password: trimmedPass,
      fullName: trimmedFullName || trimmedLogin,
      groupLeaderName: trimmedLeader || undefined,
      secretPin: cleanPin.length === PIN_CELLS_COUNT ? cleanPin : existingAccount?.secretPin,
      pinLength: PIN_CELLS_COUNT,
      createdAt: Date.now(),
    };

    const existingIdx = currentAccounts.findIndex(
      (a) => a.login.toLowerCase() === trimmedLogin.toLowerCase()
    );
    const nextAccounts =
      existingIdx >= 0
        ? currentAccounts.map((a, i) => (i === existingIdx ? newAccount : a))
        : [...currentAccounts, newAccount];

    setAccounts(nextAccounts);
    saveAccounts(nextAccounts);
    savePersonalSettingsSnapshotForUser(newAccount.login);

    setRegFullName('');
    setRegLogin('');
    setRegPassword('');
    setRegGroupLeader('');
    setRegSecretPin('');
    completeLoginSession(newAccount);
  };

  // Сброс забытого пароля по Логину + ПИН-коду
  const handleResetPasswordByPinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const lockoutRemaining = getLockoutRemainingSeconds();
    if (lockoutRemaining > 0) {
      setErrorMsg(`Защита от подбора: повторите попытку через ${lockoutRemaining} сек.`);
      return;
    }

    const trimmedLogin = resetLogin.trim();
    const cleanPin = resetSecretPin.replace(/\D/g, '');
    const trimmedNewPass = resetNewPassword.trim();

    if (!trimmedLogin || cleanPin.length !== PIN_CELLS_COUNT || !trimmedNewPass) {
      setErrorMsg(`Введите логин, все ${PIN_CELLS_COUNT} цифры ПИН-кода и новый пароль`);
      return;
    }

    const currentAccounts = loadAccounts();
    const accIdx = currentAccounts.findIndex(
      (acc) => acc.login.toLowerCase() === trimmedLogin.toLowerCase()
    );

    if (accIdx === -1) {
      setErrorMsg('Профиль с таким логином не найден');
      return;
    }

    const targetAcc = currentAccounts[accIdx];

    if (!targetAcc.secretPin || targetAcc.secretPin.slice(0, PIN_CELLS_COUNT) !== cleanPin) {
      const nextFailed = failedResetCount + 1;
      setFailedResetCount(nextFailed);
      if (nextFailed >= 3) {
        try {
          localStorage.setItem(STORAGE_RESET_LOCKOUT_KEY, String(Date.now() + 60000));
        } catch {
          // ignore
        }
        setFailedResetCount(0);
        setErrorMsg('Неверный ПИН-код. Восстановление заблокировано на 60 секунд.');
      } else {
        setErrorMsg(`Неверный ПИН-код. Осталось попыток: ${3 - nextFailed}`);
      }
      return;
    }

    setFailedResetCount(0);

    const updatedAccount: SupervisorAccount = {
      ...targetAcc,
      password: trimmedNewPass,
    };

    const nextAccounts = currentAccounts.map((a, idx) =>
      idx === accIdx ? updatedAccount : a
    );

    setAccounts(nextAccounts);
    saveAccounts(nextAccounts);

    setResetLogin('');
    setResetSecretPin('');
    setResetNewPassword('');
    completeLoginSession(updatedAccount);
  };

  // Сброс забытого ПИН-кода по Логину + Паролю
  const handleResetPinByPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const lockoutRemaining = getLockoutRemainingSeconds();
    if (lockoutRemaining > 0) {
      setErrorMsg(`Защита от подбора: повторите попытку через ${lockoutRemaining} сек.`);
      return;
    }

    const trimmedLogin = recoverPinLogin.trim();
    const trimmedPass = recoverPinPassword.trim();
    const cleanNewPin = recoverNewPin.replace(/\D/g, '');

    if (!trimmedLogin || !trimmedPass || cleanNewPin.length !== PIN_CELLS_COUNT) {
      setErrorMsg(
        `Введите логин, действующий пароль и новый ПИН-код из ${PIN_CELLS_COUNT} цифр`
      );
      return;
    }

    const currentAccounts = loadAccounts();
    const accIdx = currentAccounts.findIndex(
      (acc) => acc.login.toLowerCase() === trimmedLogin.toLowerCase()
    );

    if (accIdx === -1) {
      setErrorMsg('Профиль с таким логином не найден');
      return;
    }

    const targetAcc = currentAccounts[accIdx];

    if (targetAcc.password !== trimmedPass) {
      const nextFailed = failedResetCount + 1;
      setFailedResetCount(nextFailed);
      if (nextFailed >= 3) {
        try {
          localStorage.setItem(STORAGE_RESET_LOCKOUT_KEY, String(Date.now() + 60000));
        } catch {
          // ignore
        }
        setFailedResetCount(0);
        setErrorMsg('Неверный пароль. Восстановление заблокировано на 60 секунд.');
      } else {
        setErrorMsg(`Неверный пароль. Осталось попыток: ${3 - nextFailed}`);
      }
      return;
    }

    setFailedResetCount(0);

    const updatedAccount: SupervisorAccount = {
      ...targetAcc,
      secretPin: cleanNewPin,
      pinLength: PIN_CELLS_COUNT,
    };

    const nextAccounts = currentAccounts.map((a, idx) =>
      idx === accIdx ? updatedAccount : a
    );

    setAccounts(nextAccounts);
    saveAccounts(nextAccounts);

    setRecoverPinLogin('');
    setRecoverPinPassword('');
    setRecoverNewPin('');
    completeLoginSession(updatedAccount);
  };

  return (
    <div
      className={`fixed inset-0 ${
        requireAuth ? 'z-100 bg-[#F4F5F7]' : 'z-50 bg-black/45 backdrop-blur-[2px]'
      } flex items-center justify-center p-4 animate-in fade-in duration-150 font-mts-compact`}
    >
      <div className="relative w-full max-w-[440px] bg-white rounded-[28px] border border-[#EBECEF] shadow-2xl flex flex-col overflow-hidden">
        {/* Шапка окна без декоративных иконок */}
        <div className="px-6 pt-5 pb-4 border-b border-[#F2F3F7] flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-[#1D2023] font-mts-extended leading-tight">
              Профиль
            </h2>
          </div>

          {!requireAuth && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Закрыть окно профиля"
              className="w-9 h-9 rounded-full bg-[#F2F3F7] hover:bg-[#E5E7EB] text-[#1D2023] flex items-center justify-center transition-colors cursor-pointer"
            >
              <X className="w-4 h-4 stroke-[1.75]" />
            </button>
          )}
        </div>

        {/* Переключатель Вход / Регистрация */}
        {(activeTab === 'login' || activeTab === 'register') && (
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
        )}

        {/* 1. ВКЛАДКА ВХОДА: сначала Пароль, затем Быстрый вход ПИН */}
        {activeTab === 'login' && (
          <form onSubmit={handleLoginSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-[#626C77] mb-1.5">
                Логин
              </label>
              <input
                type="text"
                value={loginInput}
                onChange={(e) => {
                  const val = e.target.value;
                  if (checkAndTriggerDevCode(val)) return;
                  setLoginInput(val);
                }}
                placeholder="Например: iivanov"
                autoFocus
                className="w-full h-11 px-4 rounded-2xl bg-[#F2F3F7] focus:bg-white border border-[#D5D8DD] focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30 text-xs font-semibold text-[#1D2023] placeholder:text-[#8C95A0] focus:outline-none transition-all"
              />
            </div>

            {/* Переключатель способа входа: сначала По паролю, затем Быстрый вход ПИН без скобок */}
            <div className="flex items-center justify-between gap-2 pt-0.5">
              <div className="inline-flex items-center bg-[#F2F3F7] p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod('password');
                    setErrorMsg(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    loginMethod === 'password'
                      ? 'bg-white text-[#1D2023] shadow-2xs'
                      : 'text-[#626C77] hover:text-[#1D2023]'
                  }`}
                >
                  По паролю
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMethod('pin');
                    setErrorMsg(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    loginMethod === 'pin'
                      ? 'bg-white text-[#1D2023] shadow-2xs'
                      : 'text-[#626C77] hover:text-[#1D2023]'
                  }`}
                >
                  Быстрый вход ПИН
                </button>
              </div>

              {loginMethod === 'password' ? (
                <button
                  type="button"
                  onClick={() => {
                    setResetLogin(loginInput);
                    setErrorMsg(null);
                    setSuccessMsg(null);
                    setActiveTab('reset_password');
                  }}
                  className="text-[11px] font-semibold text-[#626C77] hover:text-[#1D2023] hover:underline transition-colors cursor-pointer"
                >
                  Забыли пароль?
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setRecoverPinLogin(loginInput);
                    setErrorMsg(null);
                    setSuccessMsg(null);
                    setActiveTab('reset_pin');
                  }}
                  className="text-[11px] font-semibold text-[#626C77] hover:text-[#1D2023] hover:underline transition-colors cursor-pointer"
                >
                  Забыли ПИН-код?
                </button>
              )}
            </div>

            {loginMethod === 'password' ? (
              <div>
                <label className="block text-xs font-semibold text-[#626C77] mb-1.5">
                  Пароль
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Введите пароль"
                    className="w-full h-11 pl-4 pr-10 rounded-2xl bg-[#F2F3F7] focus:bg-white border border-[#D5D8DD] focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30 text-xs font-semibold text-[#1D2023] placeholder:text-[#8C95A0] focus:outline-none transition-all"
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
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#626C77]">
                    Введите ПИН-код
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowLoginPin((p) => !p)}
                    title={showLoginPin ? 'Скрыть цифры' : 'Показать цифры'}
                    className="w-7 h-7 rounded-lg bg-[#F2F3F7] hover:bg-[#E5E7EB] text-[#626C77] hover:text-[#1D2023] flex items-center justify-center cursor-pointer"
                  >
                    {showLoginPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>

                <PinCellsInput
                  value={loginPinInput}
                  onChange={setLoginPinInput}
                  masked={!showLoginPin}
                />
              </div>
            )}

            {accounts.length === 0 && (
              <div className="text-[11px] text-[#626C77] bg-[#F8F9FB] px-3.5 py-2.5 rounded-xl border border-[#EBECEF]">
                Если вы входите впервые — переключитесь на вкладку{' '}
                <button
                  type="button"
                  onClick={() => setActiveTab('register')}
                  className="text-[#1D2023] font-bold hover:underline cursor-pointer"
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

            {successMsg && (
              <div className="px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700">
                {successMsg}
              </div>
            )}

            <div className="pt-2 flex items-center gap-3">
              {!requireAuth && (
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 h-12 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer"
                >
                  ОТМЕНА
                </button>
              )}
              <button
                type="submit"
                className="flex-1 h-12 rounded-full bg-[#FF0023] hover:bg-[#E30613] text-white text-xs font-bold uppercase tracking-wide transition-colors shadow-sm cursor-pointer"
              >
                ВОЙТИ
              </button>
            </div>
          </form>
        )}

        {/* 2. ВКЛАДКА РЕГИСТРАЦИИ: строго в ОДИН столбик */}
        {activeTab === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="p-6 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-[#626C77] mb-1">
                Имя и Фамилия
              </label>
              <input
                type="text"
                value={regFullName}
                onChange={(e) => setRegFullName(e.target.value)}
                placeholder="Иван Иванов"
                autoFocus
                className="w-full h-10 px-3.5 rounded-2xl bg-[#F2F3F7] focus:bg-white border border-[#D5D8DD] focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30 text-xs font-semibold text-[#1D2023] placeholder:text-[#8C95A0] focus:outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#626C77] mb-1">
                Логин для входа
              </label>
              <input
                type="text"
                value={regLogin}
                onChange={(e) => setRegLogin(e.target.value)}
                placeholder="iivanov"
                className="w-full h-10 px-3.5 rounded-2xl bg-[#F2F3F7] focus:bg-white border border-[#D5D8DD] focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30 text-xs font-semibold text-[#1D2023] placeholder:text-[#8C95A0] focus:outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#626C77] mb-1">
                Ваш Ведущий специалист
              </label>
              <input
                type="text"
                value={regGroupLeader}
                onChange={(e) => setRegGroupLeader(e.target.value)}
                placeholder="Андрей Андреевич"
                className="w-full h-10 px-3.5 rounded-2xl bg-[#F2F3F7] focus:bg-white border border-[#D5D8DD] focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30 text-xs font-semibold text-[#1D2023] placeholder:text-[#8C95A0] focus:outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#626C77] mb-1">
                Пароль
              </label>
              <div className="relative">
                <input
                  type={showRegPassword ? 'text' : 'password'}
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Пароль"
                  className="w-full h-10 pl-3.5 pr-9 rounded-2xl bg-[#F2F3F7] focus:bg-white border border-[#D5D8DD] focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30 text-xs font-semibold text-[#1D2023] placeholder:text-[#8C95A0] focus:outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowRegPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C95A0] hover:text-[#1D2023] cursor-pointer"
                >
                  {showRegPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Блок создания ПИН-кода: опционально, по умолчанию 4 цифры */}
            <div className="p-3.5 rounded-2xl bg-[#F8F9FB] border border-[#EBECEF] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#1D2023]">
                  Придумайте Пин-код
                </span>
                <button
                  type="button"
                  onClick={() => setShowRegPin((p) => !p)}
                  className="w-7 h-7 rounded-lg bg-white border border-[#EBECEF] text-[#626C77] hover:text-[#1D2023] flex items-center justify-center cursor-pointer"
                >
                  {showRegPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              <PinCellsInput
                value={regSecretPin}
                onChange={setRegSecretPin}
                masked={!showRegPin}
              />
            </div>

            {errorMsg && (
              <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-[#E30613]">
                {errorMsg}
              </div>
            )}

            <div className="pt-1 flex items-center gap-3">
              {!requireAuth && (
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 h-12 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] text-xs font-bold uppercase tracking-wide transition-colors cursor-pointer"
                >
                  ОТМЕНА
                </button>
              )}
              <button
                type="submit"
                className="flex-1 h-12 rounded-full bg-[#FF0023] hover:bg-[#E30613] text-white text-xs font-bold uppercase tracking-wide transition-colors shadow-sm cursor-pointer"
              >
                СОХРАНИТЬ И ВОЙТИ
              </button>
            </div>
          </form>
        )}

        {/* 3. ВОССТАНОВЛЕНИЕ ЗАБЫТОГО ПАРОЛЯ ПО ПИН-КОДУ */}
        {activeTab === 'reset_password' && (
          <form onSubmit={handleResetPasswordByPinSubmit} className="p-6 space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-[#626C77] mb-1.5">
                Ваш логин
              </label>
              <input
                type="text"
                value={resetLogin}
                onChange={(e) => setResetLogin(e.target.value)}
                placeholder="Например: iivanov"
                autoFocus
                className="w-full h-11 px-4 rounded-2xl bg-[#F2F3F7] focus:bg-white border border-[#D5D8DD] focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30 text-xs font-semibold text-[#1D2023] placeholder:text-[#8C95A0] focus:outline-none transition-all"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#626C77]">
                Ваш ПИН-код
              </label>
              <PinCellsInput
                value={resetSecretPin}
                onChange={setResetSecretPin}
                masked={false}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#626C77] mb-1.5">
                Новый пароль
              </label>
              <div className="relative">
                <input
                  type={showResetPassword ? 'text' : 'password'}
                  value={resetNewPassword}
                  onChange={(e) => setResetNewPassword(e.target.value)}
                  placeholder="Придумайте новый пароль"
                  className="w-full h-11 pl-4 pr-10 rounded-2xl bg-[#F2F3F7] focus:bg-white border border-[#D5D8DD] focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30 text-xs font-semibold text-[#1D2023] placeholder:text-[#8C95A0] focus:outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowResetPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C95A0] hover:text-[#1D2023] cursor-pointer"
                >
                  {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-[#E30613]">
                {errorMsg}
              </div>
            )}

            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setSuccessMsg(null);
                  setActiveTab('login');
                }}
                className="flex-1 h-12 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] text-xs font-bold uppercase tracking-wide transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>КО ВХОДУ</span>
              </button>
              <button
                type="submit"
                className="flex-1 h-12 rounded-full bg-[#FF0023] hover:bg-[#E30613] text-white text-xs font-bold uppercase tracking-wide transition-colors shadow-sm cursor-pointer"
              >
                СБРОСИТЬ И ВОЙТИ
              </button>
            </div>
          </form>
        )}

        {/* 4. ВОССТАНОВЛЕНИЕ ЗАБЫТОГО ПИН-КОДА ПО ПАРОЛЮ */}
        {activeTab === 'reset_pin' && (
          <form onSubmit={handleResetPinByPasswordSubmit} className="p-6 space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-[#626C77] mb-1.5">
                Ваш логин
              </label>
              <input
                type="text"
                value={recoverPinLogin}
                onChange={(e) => setRecoverPinLogin(e.target.value)}
                placeholder="Например: iivanov"
                autoFocus
                className="w-full h-11 px-4 rounded-2xl bg-[#F2F3F7] focus:bg-white border border-[#D5D8DD] focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30 text-xs font-semibold text-[#1D2023] placeholder:text-[#8C95A0] focus:outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#626C77] mb-1.5">
                Ваш действующий пароль
              </label>
              <div className="relative">
                <input
                  type={showRecoverPassword ? 'text' : 'password'}
                  value={recoverPinPassword}
                  onChange={(e) => setRecoverPinPassword(e.target.value)}
                  placeholder="Введите ваш пароль"
                  className="w-full h-11 pl-4 pr-10 rounded-2xl bg-[#F2F3F7] focus:bg-white border border-[#D5D8DD] focus:border-[#0077FF] focus:ring-1 focus:ring-[#0077FF]/30 text-xs font-semibold text-[#1D2023] placeholder:text-[#8C95A0] focus:outline-none transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowRecoverPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8C95A0] hover:text-[#1D2023] cursor-pointer"
                >
                  {showRecoverPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-[#626C77]">
                Новый ПИН-код
              </label>
              <PinCellsInput
                value={recoverNewPin}
                onChange={setRecoverNewPin}
                masked={false}
              />
            </div>

            {errorMsg && (
              <div className="px-3.5 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-[#E30613]">
                {errorMsg}
              </div>
            )}

            <div className="pt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setSuccessMsg(null);
                  setActiveTab('login');
                }}
                className="flex-1 h-12 rounded-full bg-[#F5F6F8] hover:bg-[#EAECEF] text-[#1D2023] text-xs font-bold uppercase tracking-wide transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>КО ВХОДУ</span>
              </button>
              <button
                type="submit"
                className="flex-1 h-12 rounded-full bg-[#FF0023] hover:bg-[#E30613] text-white text-xs font-bold uppercase tracking-wide transition-colors shadow-sm cursor-pointer"
              >
                ОБНОВИТЬ ПИН И ВОЙТИ
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};


