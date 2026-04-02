(async function () {
    const overlay = document.getElementById('auth-overlay');
    const input = document.getElementById('pass-input');
    const btn = document.getElementById('auth-btn');
    const error = document.getElementById('auth-error');

    const EXPECTED_HASH = "102793e799145d7ab889ff0153d8ec011905a25912819349f32d748ce065b645";

    if (localStorage.getItem('pump_verified') === 'true') {
        overlay.style.display = 'none';
        return;
    } else {
        overlay.style.display = 'flex';
        setTimeout(() => input.focus(), 100);
    }

    async function hashPassword(str) {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    async function verify() {
        const hashedInput = await hashPassword(input.value);
        if (hashedInput === EXPECTED_HASH) {
            localStorage.setItem('pump_verified', 'true');
            // Efektowne wyjście (fade out)
            overlay.style.transition = 'opacity 0.3s ease';
            overlay.style.opacity = '0';
            setTimeout(() => overlay.style.display = 'none', 300);
        } else {
            error.classList.remove('hidden');
            input.value = '';
            input.classList.add('border-red-500');
            // Drganie inputa przy błędzie (opcjonalne, ale fajne)
            input.classList.add('animate-pulse');
            setTimeout(() => input.classList.remove('animate-pulse'), 500);
        }
    }

    btn.addEventListener('click', verify);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') verify();
    });
})();