(async function () {
    if (sessionStorage.getItem('pump_verified') !== 'true') {
        document.documentElement.style.display = 'none';
    } else {
        return;
    }

    const EXPECTED_HASH = "102793e799145d7ab889ff0153d8ec011905a25912819349f32d748ce065b645";

    async function hashPassword(str) {
        const encoder = new TextEncoder();
        const data = encoder.encode(str);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    const password = prompt("Dostęp chroniony. Podaj hasło:");

    if (password) {
        const hashedInput = await hashPassword(password);
        if (hashedInput === EXPECTED_HASH) {
            sessionStorage.setItem('pump_verified', 'true');
            document.documentElement.style.display = '';
        } else {
            alert("Nieprawidłowe hasło!");
            window.location.href = "about:blank";
        }
    } else {
        window.location.href = "about:blank";
    }
})();