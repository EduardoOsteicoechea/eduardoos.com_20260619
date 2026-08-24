using Autodesk.Revit.ApplicationServices;
using Autodesk.Revit.DB;
using DesignAutomationFramework;

namespace RevitHello;

public class App : IExternalDBApplication
{
    public ExternalDBApplicationResult OnStartup(ControlledApplication application)
    {
        DesignAutomationBridge.DesignAutomationReadyEvent += OnDesignAutomationReady;
        return ExternalDBApplicationResult.Succeeded;
    }

    public ExternalDBApplicationResult OnShutdown(ControlledApplication application)
    {
        return ExternalDBApplicationResult.Succeeded;
    }

    private void OnDesignAutomationReady(object? sender, DesignAutomationReadyEventArgs e)
    {
        try
        {
            e.Succeeded = Run(e.DesignAutomationData);
        }
        catch (Exception ex)
        {
            try
            {
                File.WriteAllText(
                    Path.Combine(Directory.GetCurrentDirectory(), "result.json"),
                    "{\"ok\":false,\"error\":\"" + Escape(ex.GetType().Name + ": " + ex.Message) + "\"}"
                );
            }
            catch
            {
            }
            e.Succeeded = false;
        }
    }

    private static bool Run(DesignAutomationData data)
    {
        if (data == null)
        {
            throw new InvalidOperationException("DesignAutomationData is null");
        }

        Document? doc = data.RevitDoc;
        if (doc == null)
        {
            string path = data.FilePath ?? "";
            throw new InvalidOperationException("RevitDoc is null; filePath=" + path);
        }

        ExtractDocumentDataDto dto = new ExtractDocumentData(doc).Extract();
        ExtractDocumentDataObservable observable = dto.ToObservableObject();

        string outPath = Path.Combine(Directory.GetCurrentDirectory(), "result.json");
        File.WriteAllText(outPath, observable.ToJson());
        return File.Exists(outPath);
    }

    private static string Escape(string value)
    {
        return value
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"")
            .Replace("\r", "\\r")
            .Replace("\n", "\\n")
            .Replace("\t", "\\t");
    }
}
