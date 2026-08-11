using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Baytara;

/// <summary>
/// Baytara desktop shell for Windows.
///
/// It is the website in a WebView2 window, plus the one thing a browser cannot do:
/// SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE) removes this window from every screen
/// capture path in Windows — OBS, the Snipping Tool, Xbox Game Bar, Teams/Zoom sharing and
/// PrintScreen all get black where the lesson is. The window still looks normal on screen.
///
/// WebView2 is the Edge engine, so PlayReady and Widevine DRM behave exactly as they do in
/// Edge, which is the browser the strict policy already trusts.
///
/// Not covered: system audio. Windows has no per-application capture exclusion for sound, so
/// a loopback recorder can still take the audio. The inaudible account watermark that the web
/// app emits still identifies whoever did.
/// </summary>
public sealed class MainForm : Form
{
    private const string SiteUrl = "https://baytara.app";
    // Marks this client as the Baytara shell — the backend serves protected video to it.
    private const string UserAgentSuffix = " BaytaraApp/1";

    private const uint WDA_NONE = 0x00000000;
    private const uint WDA_EXCLUDEFROMCAPTURE = 0x00000011; // Windows 10 2004 (build 19041) and later
    private const uint WDA_MONITOR = 0x00000001;            // older builds: black in captures too

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWindowDisplayAffinity(IntPtr hWnd, uint dwAffinity);

    private readonly WebView2 _web = new();

    public MainForm()
    {
        Text = "بيطرة — Baytara";
        RightToLeft = RightToLeft.Yes;
        WindowState = FormWindowState.Maximized;
        MinimumSize = new Size(960, 640);
        StartPosition = FormStartPosition.CenterScreen;

        _web.Dock = DockStyle.Fill;
        Controls.Add(_web);

        Load += async (_, _) => await StartAsync();
        HandleCreated += (_, _) => ProtectWindow();
    }

    /// <summary>Exclude this window from every screen-capture API Windows offers.</summary>
    private void ProtectWindow()
    {
        if (!IsHandleCreated) return;
        // Falls back to WDA_MONITOR on pre-2004 builds, which also blanks captures.
        if (!SetWindowDisplayAffinity(Handle, WDA_EXCLUDEFROMCAPTURE))
        {
            SetWindowDisplayAffinity(Handle, WDA_MONITOR);
        }
    }

    private async Task StartAsync()
    {
        var environment = await CoreWebView2Environment.CreateAsync();
        await _web.EnsureCoreWebView2Async(environment);

        var settings = _web.CoreWebView2.Settings;
        settings.UserAgent += UserAgentSuffix;
        settings.AreDevToolsEnabled = false;          // no DevTools to pull the stream apart
        settings.AreDefaultContextMenusEnabled = false; // no right-click save
        settings.IsStatusBarEnabled = false;
        settings.IsSwipeNavigationEnabled = false;

        // Re-apply after any state change: a re-created handle drops the affinity flag.
        _web.CoreWebView2.NavigationCompleted += (_, _) => ProtectWindow();

        // Keep the user inside the app; open anything external in their normal browser.
        _web.CoreWebView2.NewWindowRequested += (_, args) =>
        {
            args.Handled = true;
            _web.CoreWebView2.Navigate(args.Uri);
        };

        _web.CoreWebView2.Navigate(SiteUrl);
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        ProtectWindow();
    }
}
