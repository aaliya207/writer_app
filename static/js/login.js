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
document.getElementById('guestLoginBtn').addEventListener('click', async () => {
    const name = document.getElementById('guestNameInput').value.trim();
    if (!name) {
        document.getElementById('guestNameInput').focus();
        document.getElementById('guestNameInput').style.borderColor = '#e07070';
        return;
    }

    // Save guest info to localStorage (keep this for frontend use)
    localStorage.setItem('scripvia_guest', JSON.stringify({
        name,
        isGuest:   true,
        createdAt: Date.now()
    }));

    // Tell Flask about the guest session so it can persist it
    await fetch('/auth/guest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
    });

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