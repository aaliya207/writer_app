// =============================================
// SCRIPVIA — Login Page Logic
// =============================================

// --- THEME ---
let isDark = localStorage.getItem('scripvia_theme') !== 'light';

function applyTheme() {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    document.getElementById('loginThemeIcon').textContent = isDark ? '🌙' : '☀️';
    localStorage.setItem('scripvia_theme', isDark ? 'dark' : 'light');
}

document.getElementById('loginThemeToggle').addEventListener('click', () => {
    isDark = !isDark;
    applyTheme();
});

// Apply on load
applyTheme();

// --- GUEST LOGIN ---
document.getElementById('guestLoginBtn').addEventListener('click', () => {
    const name = document.getElementById('guestNameInput').value.trim();
    if (!name) {
        document.getElementById('guestNameInput').focus();
        document.getElementById('guestNameInput').style.borderColor = '#e07070';
        return;
    }

    // Save guest info to localStorage
    localStorage.setItem('scripvia_guest', JSON.stringify({
        name,
        isGuest:   true,
        createdAt: Date.now()
    }));

    // Redirect to main app
    window.location.href = '/';
});

// Enter key on guest input
document.getElementById('guestNameInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('guestLoginBtn').click();
});

// Reset border color on input focus
document.getElementById('guestNameInput').addEventListener('focus', e => {
    e.target.style.borderColor = '';
});