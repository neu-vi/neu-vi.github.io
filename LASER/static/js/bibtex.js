function copyBibtex() {
    const text = document.getElementById('bibtex-text').innerText;
    
    navigator.clipboard.writeText(text).then(() => {
        // Visual feedback
        const btn = document.querySelector('.copy-btn');
        btn.textContent = 'Copied!';
        btn.style.background = '#4CAF50';
        btn.style.color = 'white';
        btn.style.borderColor = '#4CAF50';
        
        // Reset after 2 seconds
        setTimeout(() => {
            btn.textContent = 'Copy';
            btn.style.background = ''; // Reverts to CSS default
            btn.style.color = '';
            btn.style.borderColor = '';
        }, 2000);
    });
}