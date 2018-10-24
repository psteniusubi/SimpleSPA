using Microsoft.AspNetCore.Mvc;

namespace SimpleSPA.Controllers
{
    public class HomeController : Controller
    {
        [HttpGet]
        public IActionResult Index()
        {
            return Redirect("~/spa.html");
        }
    }
}
